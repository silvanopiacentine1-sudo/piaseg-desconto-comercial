import json
import os
import shutil
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from pydantic import BaseModel, Field

load_dotenv()

# ---------------------------------------------------------------------------
# Trava de segurança: no Render, DATA_DIR é obrigatório (mesmo padrão dos
# outros projetos Piaseg) — sem isso, um deploy sem a env var configurada
# gravaria dados no container efêmero e perderia tudo silenciosamente.
# ---------------------------------------------------------------------------
if os.getenv("RENDER") and not os.getenv("DATA_DIR"):
    raise RuntimeError(
        "DATA_DIR não está configurado no Render. Isso faria o app gravar dados "
        "fora do disco persistente, perdendo tudo no próximo deploy. Configure a "
        "env var DATA_DIR=/data no serviço antes de tentar de novo."
    )

app = FastAPI(title="Piaseg Desconto Comercial - Conta Corrente")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

APP_DIR = Path(__file__).parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(APP_DIR / "data_local")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

SEGURADORAS_FILE = DATA_DIR / "seguradoras.json"
LANCAMENTOS_FILE = DATA_DIR / "lancamentos.json"
ADMIN_FILE = DATA_DIR / "admin.json"
BACKUPS_DIR = DATA_DIR / "backups"
MAX_BACKUPS = 60
# Além do snapshot a cada deploy, tira um snapshot automático antes de uma
# gravação se o último tiver mais de 1h — assim um erro de operação no meio
# do dia também tem ponto de volta, não só os deploys.
AUTO_SNAPSHOT_INTERVAL_S = 3600
GESTORES_FILE = DATA_DIR / "gestores.json"
SOLICITACOES_FILE = DATA_DIR / "solicitacoes.json"
_DATA_FILES = ["seguradoras.json", "lancamentos.json", "gestores.json", "solicitacoes.json"]
_BACKUP_FILES = _DATA_FILES + ["admin.json"]
LOGOS_DIR = DATA_DIR / "logos"
LOGO_MAX_BYTES = 2 * 1024 * 1024
LOGO_TIPOS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg"}

# Lista de franqueados para o formulário de solicitação vem do Piaseg
# Franqueados (só os nomes dos ativos), com cache para não depender dele a
# cada acesso; se estiver fora do ar o formulário aceita digitação livre.
FRANQUEADOS_API_URL = os.getenv("FRANQUEADOS_API_URL", "https://piaseg-franqueados-backend.onrender.com/franqueados")
FRANQUEADOS_CACHE_S = 600

ADMIN_PASSWORD_SEED = os.getenv("ADMIN_PASSWORD", "")

# Tipos de lançamento:
#  credito    — entra saldo de desconto na conta da seguradora
#  utilizacao — desconto usado direto (sai do saldo)
#  reserva    — valor separado para um uso previsto; enquanto "aberta" reduz
#               o "saldo a utilizar"; ao ser baixada vira utilização
#               (status "utilizada"); se cancelada, libera o valor.
TIPOS = {"credito", "utilizacao", "reserva"}

_lock = threading.Lock()


def _load(path: Path) -> list:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def _save(path: Path, data) -> None:
    _maybe_auto_snapshot()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)  # gravação atômica: nunca deixa o arquivo pela metade
    _marcar_alteracao()


# Versão dos dados: muda a cada gravação. As telas (pública e admin) consultam
# GET /versao a cada poucos segundos e só recarregam quando ela muda — é o que
# faz a resposta do gestor aparecer no painel do franqueado sem refresh.
_versao = {"v": time.time_ns()}


def _marcar_alteracao() -> None:
    _versao["v"] = time.time_ns()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _snapshot(prefix: str = "") -> str:
    name = prefix + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    snapshot_dir = BACKUPS_DIR / name
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    for filename in _BACKUP_FILES:
        source = DATA_DIR / filename
        if source.exists():
            shutil.copy2(source, snapshot_dir / filename)
    if LOGOS_DIR.exists():
        shutil.copytree(LOGOS_DIR, snapshot_dir / "logos", dirs_exist_ok=True)
    existing = sorted((p for p in BACKUPS_DIR.iterdir() if p.is_dir()), key=lambda p: p.stat().st_mtime)
    for old in existing[:-MAX_BACKUPS]:
        shutil.rmtree(old, ignore_errors=True)
    return name


def _maybe_auto_snapshot() -> None:
    if not os.getenv("DATA_DIR") or not BACKUPS_DIR.exists():
        return
    dirs = [p for p in BACKUPS_DIR.iterdir() if p.is_dir()]
    latest = max((p.stat().st_mtime for p in dirs), default=0)
    if datetime.now(timezone.utc).timestamp() - latest > AUTO_SNAPSHOT_INTERVAL_S:
        _snapshot("auto-")


def _run_startup_backup() -> None:
    """Snapshot dos dados a cada subida do app (= cada deploy). Só roda com
    DATA_DIR explicitamente setado (produção), nunca em dev local."""
    if not os.getenv("DATA_DIR"):
        return
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    _snapshot("deploy-")


_run_startup_backup()


# ---------------------------------------------------------------------------
# Auth admin (senha única compartilhada; cada operador informa o nome, que
# fica gravado em todo lançamento que ele fizer)
# ---------------------------------------------------------------------------

bearer = HTTPBearer()


def _load_admin_password() -> str:
    if not ADMIN_FILE.exists():
        ADMIN_FILE.write_text(json.dumps({"password": ADMIN_PASSWORD_SEED}), encoding="utf-8")
        return ADMIN_PASSWORD_SEED
    return json.loads(ADMIN_FILE.read_text(encoding="utf-8")).get("password", "")


def require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> None:
    senha_atual = _load_admin_password()
    if not senha_atual or credentials.credentials != senha_atual:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha inválida")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class AdminLogin(BaseModel):
    password: str


class SenhaUpdate(BaseModel):
    senha_nova: str


class SeguradoraIn(BaseModel):
    nome: str
    ativa: bool = True


class LancamentoIn(BaseModel):
    tipo: Literal["credito", "utilizacao", "reserva"]
    valor: float = Field(gt=0)
    descricao: str = ""
    franqueado: str = ""
    data: Optional[str] = None  # AAAA-MM-DD; padrão = hoje
    operador: str
    categoria: str = ""  # "" = verba geral; senão, produto do desconto especial (ex.: Máquinas agrícolas)


class AcaoOperador(BaseModel):
    operador: str
    motivo: str = ""


class GestorIn(BaseModel):
    nome: str
    email: str = ""
    ativo: bool = True


class SolicitacaoIn(BaseModel):
    seguradora_id: str
    valor: float = Field(gt=0)
    franqueado: str
    gestor_id: str
    observacao: str = ""
    categoria: str = ""  # verba geral ("") ou desconto especial


CANAIS = ("WhatsApp", "Telefone", "E-mail", "Presencial", "Outro")


class SolicitacaoGestorIn(SolicitacaoIn):
    """Reserva feita pelo gestor em nome do franqueado (pedido por WhatsApp etc.)."""
    canal: str = "WhatsApp"
    aprovar: bool = True
    resposta: str = ""
    operador: str


class RespostaSolicitacao(BaseModel):
    decisao: Literal["aprovar", "reprovar"]
    resposta: str = ""
    operador: str


# ---------------------------------------------------------------------------
# Cálculo de saldos
# ---------------------------------------------------------------------------


def _cents(valor: float) -> int:
    return int(round(valor * 100))


def _logo_url(seguradora: dict) -> Optional[str]:
    # ?v= muda a cada upload, para o navegador não mostrar a logo antiga do cache
    logo = seguradora.get("logo")
    return f'/logos/{logo["arquivo"]}?v={logo["versao"]}' if logo else None


SP_TZ = timezone(timedelta(hours=-3))  # America/Sao_Paulo (sem horário de verão)


def _hoje_sp() -> str:
    return datetime.now(SP_TZ).date().isoformat()


def _data_sp(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(SP_TZ).date().isoformat()


def _sol_data(s: dict) -> str:
    return s.get("data") or _data_sp(s["created_at"])


def _no_mes(data: str, mes: Optional[str]) -> bool:
    # A verba é mensal: começa e termina no mesmo mês. mes=None = todo o período.
    return mes is None or data[:7] == mes


def _validar_mes(mes: Optional[str]) -> Optional[str]:
    if not mes or mes == "todos":
        return None
    try:
        datetime.strptime(mes, "%Y-%m")
    except ValueError:
        raise HTTPException(400, "Mês inválido (use AAAA-MM)")
    return mes


def _meses_disponiveis(lancamentos: list[dict], solicitacoes: list[dict]) -> list[str]:
    meses = {_hoje_sp()[:7]}
    meses |= {l["data"][:7] for l in lancamentos}
    meses |= {_sol_data(s)[:7] for s in solicitacoes}
    return sorted(meses, reverse=True)


# Franqueado de treinamento: as gestoras treinam novos franqueados com ele.
# Tudo que for feito em nome dele funciona normalmente, mas fica FORA dos
# saldos reais, do extrato público e do relatório (só aparece no modo
# treinamento do painel, como simulação). Identificado pelo nome.
FRANQUEADO_TESTE = "FRANQUEADO TESTE (treinamento)"


def _eh_teste(nome: Optional[str]) -> bool:
    return (nome or "").strip().lower() == FRANQUEADO_TESTE.lower()


# Desconto especial: verba recebida para um produto específico (ex.:
# Máquinas agrícolas). Cada produto tem saldo PRÓPRIO dentro da seguradora,
# separado da verba geral. Identificado pelo campo "categoria" ("" = geral).
def _cat(x: dict) -> str:
    return (x.get("categoria") or "").strip()


def _norm_cat(c: str) -> str:
    c = " ".join((c or "").split())
    if len(c) > 60:
        raise HTTPException(400, "Nome do desconto especial muito longo (máx. 60 caracteres)")
    return c


def _resumo(seguradora: dict, lancamentos: list[dict], solicitacoes: list[dict] = (), mes: Optional[str] = None,
            treino: bool = False, categoria: Optional[str] = "") -> dict:
    """Quadros do painel (tudo dentro do mês informado):
    Saldo     = verba creditada (saldo inicial);
    Reserva   = solicitações em análise + reservas manuais em aberto;
    Liberado  = aprovado pelo gestor (reserva de solicitação em aberto) + já utilizado;
    Saldo à utilizar = Saldo − Reserva − Liberado."""
    creditos = utilizado = reservado = liberado_aberto = em_analise = 0
    ultimo = None
    for s in solicitacoes:
        if _eh_teste(s["franqueado"]) and not treino:
            continue
        if categoria is not None and _cat(s) != categoria:
            continue
        if s["seguradora_id"] == seguradora["id"] and s["status"] == "pendente" and _no_mes(_sol_data(s), mes):
            em_analise += s["valor_centavos"]
            ultimo = max(ultimo or "", s["created_at"])
    for l in lancamentos:
        if l["seguradora_id"] != seguradora["id"] or not _no_mes(l["data"], mes):
            continue
        if _eh_teste(l.get("franqueado")) and not treino:
            continue
        if categoria is not None and _cat(l) != categoria:
            continue
        ultimo = max(ultimo or "", l.get("updated_at") or l["created_at"])
        if l.get("estornado"):
            continue
        if l["tipo"] == "credito":
            creditos += l["valor_centavos"]
        elif l["tipo"] == "utilizacao":
            utilizado += l["valor_centavos"]
        elif l["tipo"] == "reserva":
            if l.get("status") == "aberta":
                if l.get("solicitacao_id"):
                    liberado_aberto += l["valor_centavos"]  # aprovada pelo gestor
                else:
                    reservado += l["valor_centavos"]
            elif l.get("status") == "utilizada":
                utilizado += l["valor_centavos"]
    reservado += em_analise
    liberado = liberado_aberto + utilizado
    return {
        "id": seguradora["id"],
        "nome": seguradora["nome"],
        "logo_url": _logo_url(seguradora),
        "ativa": seguradora.get("ativa", True),
        "creditos": creditos / 100,
        "utilizado": utilizado / 100,
        "saldo": creditos / 100,
        "reserva": reservado / 100,
        "em_analise": em_analise / 100,
        "liberado": liberado / 100,
        "saldo_a_utilizar": (creditos - reservado - liberado) / 100,
        "atualizado_em": ultimo or seguradora.get("created_at"),
    }


def _especiais(seguradora: dict, lancamentos: list[dict], solicitacoes: list[dict], mes: Optional[str],
               treino: bool = False) -> list[dict]:
    """Um resumo por desconto especial da seguradora que tenha movimento no mês."""
    cats = {_cat(l) for l in lancamentos
            if l["seguradora_id"] == seguradora["id"] and _cat(l) and _no_mes(l["data"], mes) and not l.get("estornado")}
    cats |= {_cat(x) for x in solicitacoes
             if x["seguradora_id"] == seguradora["id"] and _cat(x) and _no_mes(_sol_data(x), mes)}
    out = []
    for c in sorted(cats, key=str.lower):
        r = _resumo(seguradora, lancamentos, solicitacoes, mes, treino, categoria=c)
        out.append({"categoria": c, **{k: r[k] for k in ("saldo", "reserva", "em_analise", "liberado", "saldo_a_utilizar")}})
    return out


def _seguradora_or_404(seguradoras: list[dict], seg_id: str) -> dict:
    for s in seguradoras:
        if s["id"] == seg_id:
            return s
    raise HTTPException(404, "Seguradora não encontrada")


def _lancamento_or_404(lancamentos: list[dict], lanc_id: str) -> dict:
    for l in lancamentos:
        if l["id"] == lanc_id:
            return l
    raise HTTPException(404, "Lançamento não encontrado")


def _public_lancamento(l: dict) -> dict:
    out = dict(l)
    out["valor"] = l["valor_centavos"] / 100
    out["teste"] = _eh_teste(l.get("franqueado"))
    return out


def _operador(nome: str) -> str:
    nome = (nome or "").strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do operador")
    return nome


# ---------------------------------------------------------------------------
# Rotas públicas
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/versao")
def versao():
    return JSONResponse({"v": str(_versao["v"])}, headers={"Cache-Control": "no-store"})


_CAMPOS_PUBLICOS = ("id", "nome", "logo_url", "saldo", "reserva", "em_analise", "liberado", "saldo_a_utilizar", "atualizado_em")


@app.get("/painel")
def painel(mes: Optional[str] = None, treino: bool = False):
    """Painel aberto aos franqueados: números por seguradora ativa no mês
    (padrão = mês atual; mes=todos = período inteiro)."""
    mes_param = mes
    mes = _validar_mes(mes) if mes_param else _hoje_sp()[:7]
    seguradoras = _load(SEGURADORAS_FILE)
    lancamentos = _load(LANCAMENTOS_FILE)
    solicitacoes = _load(SOLICITACOES_FILE)
    ativas = [s for s in seguradoras if s.get("ativa", True)]
    linhas = [_resumo(s, lancamentos, solicitacoes, mes, treino) for s in ativas]
    esp = {s["id"]: _especiais(s, lancamentos, solicitacoes, mes, treino) for s in ativas}
    linhas.sort(key=lambda r: r["nome"].lower())
    return {
        "mes": mes or "todos",
        "meses": _meses_disponiveis(lancamentos, solicitacoes),
        "seguradoras": [{**{k: r[k] for k in _CAMPOS_PUBLICOS}, "especiais": esp[r["id"]]} for r in linhas],
        "totais": {
            "saldo": round(sum(r["saldo"] for r in linhas), 2),
            "reserva": round(sum(r["reserva"] for r in linhas), 2),
            "liberado": round(sum(r["liberado"] for r in linhas), 2),
            "saldo_a_utilizar": round(sum(r["saldo_a_utilizar"] for r in linhas), 2),
        },
        "atualizado_em": max((r["atualizado_em"] or "" for r in linhas), default=None) or None,
    }


def _movimentos(seg_id: str, lancamentos: list[dict], solicitacoes: list[dict], gestores: list[dict], mes: Optional[str],
                treino: bool = False) -> list[dict]:
    """Extrato público tipo conta corrente: créditos, usos e solicitações, com
    o efeito de cada um no saldo à utilizar e o saldo após cada movimento.
    Lançamentos estornados não aparecem; reservas criadas por aprovação de
    solicitação aparecem pela própria solicitação (com resposta do gestor)."""
    lanc_por_id = {l["id"]: l for l in lancamentos}
    nomes_gest = {g["id"]: g["nome"] for g in gestores}
    itens = []
    for l in lancamentos:
        if l["seguradora_id"] != seg_id or l.get("estornado") or l.get("solicitacao_id") or not _no_mes(l["data"], mes):
            continue
        if _eh_teste(l.get("franqueado")) and not treino:
            continue
        v = l["valor_centavos"]
        if l["tipo"] == "credito":
            situacao, efeito = "credito", v
        elif l["tipo"] == "utilizacao":
            situacao, efeito = "utilizada", -v
        else:
            situacao = {"aberta": "reservada", "utilizada": "utilizada", "cancelada": "cancelada"}[l["status"]]
            efeito = 0 if situacao == "cancelada" else -v
        itens.append({
            "id": l["id"], "origem": "lancamento", "tipo": l["tipo"], "situacao": situacao,
            "data": l["data"], "ordem": l["created_at"], "valor": v / 100, "efeito_c": efeito,
            "franqueado": l.get("franqueado", ""), "descricao": l.get("descricao", ""),
            "teste": _eh_teste(l.get("franqueado")), "categoria": _cat(l),
        })
    for s in solicitacoes:
        if s["seguradora_id"] != seg_id or not _no_mes(_sol_data(s), mes):
            continue
        if _eh_teste(s["franqueado"]) and not treino:
            continue
        v = s["valor_centavos"]
        if s["status"] == "pendente":
            situacao, efeito = "em_analise", -v
        elif s["status"] == "reprovada":
            situacao, efeito = "reprovada", 0
        else:
            lanc = lanc_por_id.get(s.get("lancamento_id") or "")
            st = "estornada" if (lanc and lanc.get("estornado")) else (lanc or {}).get("status", "aberta")
            situacao = {"aberta": "aprovada", "utilizada": "aprovada_utilizada", "cancelada": "cancelada", "estornada": "cancelada"}[st]
            efeito = 0 if situacao == "cancelada" else -v
        itens.append({
            "id": s["id"], "origem": "solicitacao", "tipo": "solicitacao", "situacao": situacao, "numero": s["numero"],
            "data": _sol_data(s), "ordem": s["created_at"], "valor": v / 100, "efeito_c": efeito,
            "franqueado": s["franqueado"], "observacao": s.get("observacao", ""),
            "gestor_nome": nomes_gest.get(s["gestor_id"], "?"),
            "canal": s.get("canal"), "criado_por": s.get("criado_por"), "teste": _eh_teste(s["franqueado"]),
            "nota_gestor": s.get("nota_gestor", ""), "categoria": _cat(s),
            "resposta": s.get("resposta", ""), "respondido_por": s.get("respondido_por", ""),
            "respondido_em": s.get("respondido_em"),
        })
    itens.sort(key=lambda i: (i["data"], i["ordem"]))
    saldos: dict = {}  # cada verba (geral e cada especial) tem seu próprio saldo corrente
    for i in itens:
        efeito = i.pop("efeito_c")
        saldos[i["categoria"]] = saldos.get(i["categoria"], 0) + efeito
        i["efeito"] = efeito / 100
        i["saldo_apos"] = saldos[i["categoria"]] / 100
        del i["ordem"]
    return list(reversed(itens))


@app.get("/painel/{seg_id}")
def painel_seguradora(seg_id: str, mes: Optional[str] = None, treino: bool = False):
    mes = _validar_mes(mes) if mes else _hoje_sp()[:7]
    seguradoras = _load(SEGURADORAS_FILE)
    seg = next((s for s in seguradoras if s["id"] == seg_id and s.get("ativa", True)), None)
    if not seg:
        raise HTTPException(404, "Seguradora não encontrada")
    lancamentos, solicitacoes = _load(LANCAMENTOS_FILE), _load(SOLICITACOES_FILE)
    r = _resumo(seg, lancamentos, solicitacoes, mes, treino)
    return {
        "mes": mes or "todos",
        "treino": treino,
        "resumo": {k: r[k] for k in _CAMPOS_PUBLICOS},
        "especiais": _especiais(seg, lancamentos, solicitacoes, mes, treino),
        "movimentos": _movimentos(seg_id, lancamentos, solicitacoes, _load(GESTORES_FILE), mes, treino),
    }


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


@app.post("/admin/login")
def admin_login(body: AdminLogin):
    senha = _load_admin_password()
    if not senha or body.password != senha:
        raise HTTPException(401, "Senha inválida")
    return {"ok": True}


@app.put("/admin/senha")
def trocar_senha(body: SenhaUpdate, _: None = Depends(require_admin)):
    if len(body.senha_nova) < 6:
        raise HTTPException(400, "A senha precisa ter pelo menos 6 caracteres")
    with _lock:
        _save(ADMIN_FILE, {"password": body.senha_nova})
    return {"ok": True}


@app.get("/admin/seguradoras")
def list_seguradoras(mes: Optional[str] = None, _: None = Depends(require_admin)):
    mes = _validar_mes(mes)
    seguradoras = _load(SEGURADORAS_FILE)
    lancamentos, solicitacoes = _load(LANCAMENTOS_FILE), _load(SOLICITACOES_FILE)
    linhas = [{**_resumo(s, lancamentos, solicitacoes, mes), "especiais": _especiais(s, lancamentos, solicitacoes, mes)}
              for s in seguradoras]
    linhas.sort(key=lambda r: (not r["ativa"], r["nome"].lower()))
    return linhas


@app.get("/admin/meses")
def meses_admin(_: None = Depends(require_admin)):
    return _meses_disponiveis(_load(LANCAMENTOS_FILE), _load(SOLICITACOES_FILE))


@app.post("/admin/seguradoras", status_code=201)
def create_seguradora(body: SeguradoraIn, _: None = Depends(require_admin)):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome da seguradora")
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        if any(s["nome"].strip().lower() == nome.lower() for s in seguradoras):
            raise HTTPException(409, "Já existe uma seguradora com esse nome")
        seg = {"id": uuid.uuid4().hex[:10], "nome": nome, "ativa": body.ativa, "created_at": now_iso()}
        seguradoras.append(seg)
        _save(SEGURADORAS_FILE, seguradoras)
    return seg


@app.put("/admin/seguradoras/{seg_id}")
def update_seguradora(seg_id: str, body: SeguradoraIn, _: None = Depends(require_admin)):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome da seguradora")
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        seg = _seguradora_or_404(seguradoras, seg_id)
        if any(s["id"] != seg_id and s["nome"].strip().lower() == nome.lower() for s in seguradoras):
            raise HTTPException(409, "Já existe uma seguradora com esse nome")
        seg["nome"] = nome
        seg["ativa"] = body.ativa
        _save(SEGURADORAS_FILE, seguradoras)
    return seg


@app.delete("/admin/seguradoras/{seg_id}")
def delete_seguradora(seg_id: str, _: None = Depends(require_admin)):
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        _seguradora_or_404(seguradoras, seg_id)
        if any(l["seguradora_id"] == seg_id for l in _load(LANCAMENTOS_FILE)):
            raise HTTPException(
                409, "Essa seguradora já tem lançamentos. Para tirar do painel, desative em vez de excluir."
            )
        _save(SEGURADORAS_FILE, [s for s in seguradoras if s["id"] != seg_id])
    return {"ok": True}


@app.post("/admin/seguradoras/{seg_id}/logo")
async def upload_logo(seg_id: str, arquivo: UploadFile = File(...), _: None = Depends(require_admin)):
    ext = LOGO_TIPOS.get(arquivo.content_type or "")
    if not ext:
        raise HTTPException(400, "Formato não aceito. Use PNG, JPG, WEBP ou SVG.")
    conteudo = await arquivo.read()
    if len(conteudo) > LOGO_MAX_BYTES:
        raise HTTPException(400, "A imagem pode ter no máximo 2 MB.")
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        seg = _seguradora_or_404(seguradoras, seg_id)
        LOGOS_DIR.mkdir(parents=True, exist_ok=True)
        nome_arquivo = f"{seg_id}.{ext}"
        for antigo in LOGOS_DIR.glob(f"{seg_id}.*"):
            if antigo.name != nome_arquivo:
                antigo.unlink()
        (LOGOS_DIR / nome_arquivo).write_bytes(conteudo)
        seg["logo"] = {"arquivo": nome_arquivo, "versao": uuid.uuid4().hex[:8]}
        _save(SEGURADORAS_FILE, seguradoras)
    return {"logo_url": _logo_url(seg)}


@app.delete("/admin/seguradoras/{seg_id}/logo")
def remove_logo(seg_id: str, _: None = Depends(require_admin)):
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        seg = _seguradora_or_404(seguradoras, seg_id)
        seg.pop("logo", None)  # arquivo fica no disco (backups); só deixa de aparecer
        _save(SEGURADORAS_FILE, seguradoras)
    return {"ok": True}


@app.get("/logos/{arquivo}")
def get_logo(arquivo: str):
    caminho = LOGOS_DIR / arquivo
    if "/" in arquivo or ".." in arquivo or not caminho.is_file():
        raise HTTPException(404, "Logo não encontrada")
    ext = caminho.suffix.lstrip(".")
    media = {v: k for k, v in LOGO_TIPOS.items()}.get(ext, "application/octet-stream")
    return FileResponse(
        caminho,
        media_type=media,
        headers={
            "Cache-Control": "public, max-age=31536000",
            # SVG pode carregar script: bloqueia qualquer execução se abrirem a URL direto
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/admin/seguradoras/{seg_id}")
def get_seguradora(seg_id: str, mes: Optional[str] = None, _: None = Depends(require_admin)):
    mes = _validar_mes(mes)
    seguradoras = _load(SEGURADORAS_FILE)
    seg = _seguradora_or_404(seguradoras, seg_id)
    lancamentos, solicitacoes = _load(LANCAMENTOS_FILE), _load(SOLICITACOES_FILE)
    extrato = [
        _public_lancamento(l) for l in lancamentos if l["seguradora_id"] == seg_id and _no_mes(l["data"], mes)
    ]
    extrato.sort(key=lambda l: (l["data"], l["created_at"]), reverse=True)
    return {
        "resumo": _resumo(seg, lancamentos, solicitacoes, mes),
        "especiais": _especiais(seg, lancamentos, solicitacoes, mes),
        # todos os produtos especiais já usados nesta seguradora (para sugerir no formulário)
        "categorias": sorted({_cat(l) for l in lancamentos if l["seguradora_id"] == seg_id and _cat(l)}, key=str.lower),
        # produtos especiais usados em qualquer seguradora (sugestão ao criar um novo: Empresarial, Condomínio...)
        "categorias_todas": sorted({_cat(l) for l in lancamentos if _cat(l)}, key=str.lower),
        "lancamentos": extrato,
    }


@app.post("/admin/seguradoras/{seg_id}/lancamentos", status_code=201)
def create_lancamento(seg_id: str, body: LancamentoIn, _: None = Depends(require_admin)):
    operador = _operador(body.operador)
    # "Lançado por" tem que ser um gestor cadastrado e ativo (não aceita nome livre)
    gestor = next(
        (g for g in _load(GESTORES_FILE) if g.get("ativo", True) and g["nome"].strip().lower() == operador.lower()), None
    )
    if not gestor:
        raise HTTPException(400, "Selecione um gestor cadastrado no campo \"Lançado por\"")
    operador = gestor["nome"]
    data = body.data or _hoje_sp()
    try:
        datetime.strptime(data, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Data inválida")
    with _lock:
        _seguradora_or_404(_load(SEGURADORAS_FILE), seg_id)
        lancamentos = _load(LANCAMENTOS_FILE)
        lanc = {
            "id": uuid.uuid4().hex[:12],
            "seguradora_id": seg_id,
            "tipo": body.tipo,
            "valor_centavos": _cents(body.valor),
            "descricao": body.descricao.strip(),
            "franqueado": body.franqueado.strip(),
            "data": data,
            "operador": operador,
            "created_at": now_iso(),
            "estornado": False,
            "categoria": _norm_cat(body.categoria),
        }
        if body.tipo == "reserva":
            lanc["status"] = "aberta"
        lancamentos.append(lanc)
        _save(LANCAMENTOS_FILE, lancamentos)
    return _public_lancamento(lanc)


def _acao_reserva(lanc_id: str, body: AcaoOperador, novo_status: str) -> dict:
    operador = _operador(body.operador)
    with _lock:
        lancamentos = _load(LANCAMENTOS_FILE)
        lanc = _lancamento_or_404(lancamentos, lanc_id)
        if lanc["tipo"] != "reserva" or lanc.get("status") != "aberta" or lanc.get("estornado"):
            raise HTTPException(400, "Só é possível baixar ou cancelar uma reserva em aberto")
        lanc["status"] = novo_status
        lanc["status_por"] = operador
        lanc["status_em"] = now_iso()
        lanc["status_motivo"] = body.motivo.strip()
        lanc["updated_at"] = lanc["status_em"]
        _save(LANCAMENTOS_FILE, lancamentos)
    return _public_lancamento(lanc)


@app.post("/admin/lancamentos/{lanc_id}/utilizar")
def utilizar_reserva(lanc_id: str, body: AcaoOperador, _: None = Depends(require_admin)):
    return _acao_reserva(lanc_id, body, "utilizada")


@app.post("/admin/lancamentos/{lanc_id}/cancelar")
def cancelar_reserva(lanc_id: str, body: AcaoOperador, _: None = Depends(require_admin)):
    return _acao_reserva(lanc_id, body, "cancelada")


@app.post("/admin/lancamentos/{lanc_id}/estornar")
def estornar_lancamento(lanc_id: str, body: AcaoOperador, _: None = Depends(require_admin)):
    """Anula um lançamento feito por engano. Nada é apagado: o lançamento
    continua no extrato, marcado como estornado, com quem fez e o motivo."""
    operador = _operador(body.operador)
    if not body.motivo.strip():
        raise HTTPException(400, "Informe o motivo do estorno")
    with _lock:
        lancamentos = _load(LANCAMENTOS_FILE)
        lanc = _lancamento_or_404(lancamentos, lanc_id)
        if lanc.get("estornado"):
            raise HTTPException(400, "Esse lançamento já foi estornado")
        lanc["estornado"] = True
        lanc["estornado_por"] = operador
        lanc["estornado_em"] = now_iso()
        lanc["estorno_motivo"] = body.motivo.strip()
        lanc["updated_at"] = lanc["estornado_em"]
        _save(LANCAMENTOS_FILE, lancamentos)
    return _public_lancamento(lanc)


# ---------------------------------------------------------------------------
# Gestores (assessores comerciais que recebem as solicitações)
# ---------------------------------------------------------------------------


@app.get("/gestores")
def list_gestores_publico():
    gestores = [g for g in _load(GESTORES_FILE) if g.get("ativo", True)]
    gestores.sort(key=lambda g: g["nome"].lower())
    return [{"id": g["id"], "nome": g["nome"]} for g in gestores]


@app.get("/admin/gestores")
def list_gestores(_: None = Depends(require_admin)):
    gestores = _load(GESTORES_FILE)
    gestores.sort(key=lambda g: (not g.get("ativo", True), g["nome"].lower()))
    return gestores


@app.post("/admin/gestores", status_code=201)
def create_gestor(body: GestorIn, _: None = Depends(require_admin)):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do gestor")
    with _lock:
        gestores = _load(GESTORES_FILE)
        if any(g["nome"].strip().lower() == nome.lower() for g in gestores):
            raise HTTPException(409, "Já existe um gestor com esse nome")
        g = {"id": uuid.uuid4().hex[:10], "nome": nome, "email": body.email.strip(), "ativo": body.ativo, "created_at": now_iso()}
        gestores.append(g)
        _save(GESTORES_FILE, gestores)
    return g


@app.put("/admin/gestores/{gestor_id}")
def update_gestor(gestor_id: str, body: GestorIn, _: None = Depends(require_admin)):
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do gestor")
    with _lock:
        gestores = _load(GESTORES_FILE)
        g = next((x for x in gestores if x["id"] == gestor_id), None)
        if not g:
            raise HTTPException(404, "Gestor não encontrado")
        g.update({"nome": nome, "email": body.email.strip(), "ativo": body.ativo})
        _save(GESTORES_FILE, gestores)
    return g


@app.delete("/admin/gestores/{gestor_id}")
def delete_gestor(gestor_id: str, _: None = Depends(require_admin)):
    with _lock:
        if any(s["gestor_id"] == gestor_id for s in _load(SOLICITACOES_FILE)):
            raise HTTPException(409, "Esse gestor já recebeu solicitações. Desative em vez de excluir.")
        gestores = _load(GESTORES_FILE)
        if not any(g["id"] == gestor_id for g in gestores):
            raise HTTPException(404, "Gestor não encontrado")
        _save(GESTORES_FILE, [g for g in gestores if g["id"] != gestor_id])
    return {"ok": True}


_franq_cache: dict = {"em": 0.0, "nomes": []}


@app.get("/franqueados-lista")
def franqueados_lista():
    import urllib.request

    agora = datetime.now(timezone.utc).timestamp()
    if agora - _franq_cache["em"] > FRANQUEADOS_CACHE_S or not _franq_cache["nomes"]:
        try:
            with urllib.request.urlopen(FRANQUEADOS_API_URL, timeout=15) as r:
                dados = json.loads(r.read().decode("utf-8"))
            nomes = sorted(
                {(f.get("nome_fantasia") or "").strip() for f in dados if f.get("status", "ativo") == "ativo"} - {""},
                key=str.lower,
            )
            _franq_cache.update({"em": agora, "nomes": nomes})
        except Exception as e:  # fora do ar: devolve o último cache (ou vazio)
            print(f"[franqueados] falha ao buscar lista: {e}")
    reais = [n for n in _franq_cache["nomes"] if not _eh_teste(n)]
    # sem a lista real (sistema de franqueados fora do ar) devolve vazio: o
    # formulário cai para digitação livre em vez de mostrar só o de treinamento
    return [FRANQUEADO_TESTE] + reais if reais else []


# ---------------------------------------------------------------------------
# Solicitações de reserva (franqueado pede → gestor aprova ou não)
# ---------------------------------------------------------------------------

SOLIC_STATUS_LABEL = {"pendente": "Aguardando análise", "aprovada": "Aprovada", "reprovada": "Não aprovada"}


def _solicitacao_view(s: dict, seguradoras: list[dict], gestores: list[dict], lancamentos: list[dict]) -> dict:
    seg = next((x for x in seguradoras if x["id"] == s["seguradora_id"]), None)
    gest = next((x for x in gestores if x["id"] == s["gestor_id"]), None)
    out = {k: v for k, v in s.items() if k != "valor_centavos"}
    out["valor"] = s["valor_centavos"] / 100
    out["teste"] = _eh_teste(s["franqueado"])
    out["seguradora_nome"] = seg["nome"] if seg else "?"
    out["gestor_nome"] = gest["nome"] if gest else "?"
    if s.get("lancamento_id"):
        lanc = next((l for l in lancamentos if l["id"] == s["lancamento_id"]), None)
        if lanc:
            out["reserva_status"] = "estornada" if lanc.get("estornado") else lanc.get("status")
    return out


@app.post("/solicitacoes", status_code=201)
def create_solicitacao(body: SolicitacaoIn):
    franqueado = body.franqueado.strip()
    if not franqueado:
        raise HTTPException(400, "Informe o franqueado")
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        seg = next((s for s in seguradoras if s["id"] == body.seguradora_id and s.get("ativa", True)), None)
        if not seg:
            raise HTTPException(400, "Seguradora inválida")
        gestores = _load(GESTORES_FILE)
        if not any(g["id"] == body.gestor_id and g.get("ativo", True) for g in gestores):
            raise HTTPException(400, "Selecione o gestor que vai analisar a solicitação")
        solicitacoes = _load(SOLICITACOES_FILE)
        s = {
            # id longo e aleatório: é ele que dá acesso à página de acompanhamento
            "id": uuid.uuid4().hex,
            "numero": max((x["numero"] for x in solicitacoes), default=0) + 1,
            "seguradora_id": seg["id"],
            "valor_centavos": _cents(body.valor),
            "franqueado": franqueado,
            "gestor_id": body.gestor_id,
            "observacao": body.observacao.strip(),
            "status": "pendente",
            "data": _hoje_sp(),
            "created_at": now_iso(),
            "categoria": _norm_cat(body.categoria),
        }
        solicitacoes.append(s)
        _save(SOLICITACOES_FILE, solicitacoes)
    return _solicitacao_view(s, seguradoras, gestores, [])


@app.get("/solicitacoes/{sol_id}")
def get_solicitacao(sol_id: str):
    s = next((x for x in _load(SOLICITACOES_FILE) if x["id"] == sol_id), None)
    if not s:
        raise HTTPException(404, "Solicitação não encontrada")
    return _solicitacao_view(s, _load(SEGURADORAS_FILE), _load(GESTORES_FILE), _load(LANCAMENTOS_FILE))


@app.get("/admin/solicitacoes")
def list_solicitacoes(_: None = Depends(require_admin)):
    seguradoras, gestores, lancamentos = _load(SEGURADORAS_FILE), _load(GESTORES_FILE), _load(LANCAMENTOS_FILE)
    solicitacoes = _load(SOLICITACOES_FILE)
    segs = {s["id"]: s for s in seguradoras}
    cache: dict = {}
    out = []
    for s in sorted(solicitacoes, key=lambda x: x["numero"], reverse=True):
        v = _solicitacao_view(s, seguradoras, gestores, lancamentos)
        v["data"] = _sol_data(s)
        if s["status"] == "pendente" and s["seguradora_id"] in segs:
            # saldo do mês da solicitação, sem contar ela mesma (que já está "em análise")
            chave = (s["seguradora_id"], v["data"][:7], _cat(s))
            if chave not in cache:
                cache[chave] = _resumo(segs[s["seguradora_id"]], lancamentos, solicitacoes, chave[1],
                                       categoria=chave[2])["saldo_a_utilizar"]
            proprio = 0 if _eh_teste(s["franqueado"]) else s["valor_centavos"] / 100  # teste não está no saldo real
            v["saldo_a_utilizar_atual"] = round(cache[chave] + proprio, 2)
        out.append(v)
    return out


def _decidir(s: dict, aprovar: bool, resposta: str, operador: str) -> None:
    """Aplica a decisão do gestor na solicitação (chamar com _lock). Aprovar já
    cria a reserva liberada na conta corrente da seguradora. Quem chama salva
    a lista de solicitações depois."""
    agora = now_iso()
    if aprovar:
        lancamentos = _load(LANCAMENTOS_FILE)
        descricao = f'Solicitação #{s["numero"]}'
        if s.get("observacao"):
            descricao += f' — {s["observacao"]}'
        lanc = {
            "id": uuid.uuid4().hex[:12],
            "seguradora_id": s["seguradora_id"],
            "tipo": "reserva",
            "status": "aberta",
            "valor_centavos": s["valor_centavos"],
            "descricao": descricao,
            "franqueado": s["franqueado"],
            "data": _sol_data(s),  # reserva fica no mês da solicitação
            "operador": operador,
            "created_at": agora,
            "estornado": False,
            "solicitacao_id": s["id"],
            "categoria": _cat(s),
        }
        lancamentos.append(lanc)
        _save(LANCAMENTOS_FILE, lancamentos)
        s["lancamento_id"] = lanc["id"]
    s["status"] = "aprovada" if aprovar else "reprovada"
    s["resposta"] = resposta
    s["respondido_por"] = operador
    s["respondido_em"] = agora


@app.post("/admin/solicitacoes", status_code=201)
def create_solicitacao_gestor(body: SolicitacaoGestorIn, _: None = Depends(require_admin)):
    """Gestor registra a reserva em nome do franqueado (pedido chegou por
    WhatsApp, telefone...). Por padrão já sai aprovada/liberada; com
    aprovar=false fica em análise como um pedido normal."""
    operador = _operador(body.operador)
    franqueado = body.franqueado.strip()
    if not franqueado:
        raise HTTPException(400, "Informe o franqueado")
    canal = body.canal if body.canal in CANAIS else "Outro"
    with _lock:
        seguradoras = _load(SEGURADORAS_FILE)
        seg = next((x for x in seguradoras if x["id"] == body.seguradora_id and x.get("ativa", True)), None)
        if not seg:
            raise HTTPException(400, "Seguradora inválida")
        gestores = _load(GESTORES_FILE)
        if not any(g["id"] == body.gestor_id for g in gestores):
            raise HTTPException(400, "Selecione o gestor responsável")
        solicitacoes = _load(SOLICITACOES_FILE)
        s = {
            "id": uuid.uuid4().hex,
            "numero": max((x["numero"] for x in solicitacoes), default=0) + 1,
            "seguradora_id": seg["id"],
            "valor_centavos": _cents(body.valor),
            "franqueado": franqueado,
            "gestor_id": body.gestor_id,
            "observacao": body.observacao.strip(),
            "status": "pendente",
            "data": _hoje_sp(),
            "created_at": now_iso(),
            "origem": "gestor",
            "canal": canal,
            "criado_por": operador,
            "categoria": _norm_cat(body.categoria),
        }
        if body.aprovar:
            _decidir(s, True, body.resposta.strip(), operador)
        elif body.resposta.strip():
            # reserva com negociação em andamento: observação do gestor
            s["nota_gestor"] = body.resposta.strip()
        solicitacoes.append(s)
        _save(SOLICITACOES_FILE, solicitacoes)
    return _solicitacao_view(s, _load(SEGURADORAS_FILE), gestores, _load(LANCAMENTOS_FILE))


@app.delete("/admin/treinamento")
def limpar_treinamento(_: None = Depends(require_admin)):
    """Apaga SOMENTE solicitações e lançamentos do franqueado de treinamento
    (backup antes). Nada de franqueado real é tocado."""
    with _lock:
        if os.getenv("DATA_DIR"):
            _snapshot("antes-limpar-treino-")
        solicitacoes = _load(SOLICITACOES_FILE)
        lancamentos = _load(LANCAMENTOS_FILE)
        sol_fica = [x for x in solicitacoes if not _eh_teste(x["franqueado"])]
        lanc_fica = [x for x in lancamentos if not _eh_teste(x.get("franqueado"))]
        removidos = {"solicitacoes": len(solicitacoes) - len(sol_fica), "lancamentos": len(lancamentos) - len(lanc_fica)}
        if removidos["solicitacoes"]:
            _save(SOLICITACOES_FILE, sol_fica)
        if removidos["lancamentos"]:
            _save(LANCAMENTOS_FILE, lanc_fica)
    return removidos


@app.post("/admin/solicitacoes/{sol_id}/responder")
def responder_solicitacao(sol_id: str, body: RespostaSolicitacao, _: None = Depends(require_admin)):
    operador = _operador(body.operador)
    resposta = body.resposta.strip()
    if body.decisao == "reprovar" and not resposta:
        raise HTTPException(400, "Informe a justificativa para o franqueado")
    with _lock:
        solicitacoes = _load(SOLICITACOES_FILE)
        s = next((x for x in solicitacoes if x["id"] == sol_id), None)
        if not s:
            raise HTTPException(404, "Solicitação não encontrada")
        if s["status"] != "pendente":
            raise HTTPException(400, "Essa solicitação já foi respondida")
        _decidir(s, body.decisao == "aprovar", resposta, operador)
        _save(SOLICITACOES_FILE, solicitacoes)
    return _solicitacao_view(s, _load(SEGURADORAS_FILE), _load(GESTORES_FILE), _load(LANCAMENTOS_FILE))


# ---------------------------------------------------------------------------
# Relatório: uso de desconto por franqueado no mês
# ---------------------------------------------------------------------------


def _relatorio(mes: Optional[str], seguradora_id: Optional[str]) -> dict:
    seguradoras = _load(SEGURADORAS_FILE)
    nomes_seg = {s["id"]: s["nome"] for s in seguradoras}
    lancamentos, solicitacoes = _load(LANCAMENTOS_FILE), _load(SOLICITACOES_FILE)

    def entra(seg_id: str, data: str) -> bool:
        return (not seguradora_id or seg_id == seguradora_id) and _no_mes(data, mes)

    verba = 0
    por_franq: dict[str, dict] = {}

    def linha(nome: str) -> dict:
        nome = (nome or "").strip() or "(sem franqueado informado)"
        chave = nome.lower()
        if chave not in por_franq:
            por_franq[chave] = {
                "franqueado": nome, "utilizado": 0, "reservado": 0, "negocios": 0,
                "solic_aprovadas": 0, "solic_reprovadas": 0, "solic_pendentes": 0, "por_seguradora": {},
            }
        return por_franq[chave]

    for l in lancamentos:
        if l.get("estornado") or _eh_teste(l.get("franqueado")) or not entra(l["seguradora_id"], l["data"]):
            continue
        v = l["valor_centavos"]
        if l["tipo"] == "credito":
            verba += v
            continue
        if l["tipo"] == "reserva" and l.get("status") == "cancelada":
            continue
        r = linha(l.get("franqueado", ""))
        if l["tipo"] == "reserva" and l.get("status") == "aberta":
            r["reservado"] += v
        else:
            r["utilizado"] += v
        r["negocios"] += 1
        seg_nome = nomes_seg.get(l["seguradora_id"], "?")
        r["por_seguradora"][seg_nome] = r["por_seguradora"].get(seg_nome, 0) + v

    for s in solicitacoes:
        if _eh_teste(s["franqueado"]) or not entra(s["seguradora_id"], _sol_data(s)):
            continue
        r = linha(s["franqueado"])
        campo = {"aprovada": "solic_aprovadas", "reprovada": "solic_reprovadas", "pendente": "solic_pendentes"}[s["status"]]
        r[campo] += 1

    linhas = []
    for r in por_franq.values():
        total = r["utilizado"] + r["reservado"]
        linhas.append({
            **r,
            "utilizado": r["utilizado"] / 100,
            "reservado": r["reservado"] / 100,
            "total": total / 100,
            "percentual": round(total * 100 / verba, 1) if verba else None,
            "por_seguradora": [
                {"seguradora": k, "valor": v / 100} for k, v in sorted(r["por_seguradora"].items(), key=lambda x: -x[1])
            ],
        })
    linhas.sort(key=lambda x: (-x["total"], x["franqueado"].lower()))
    usado = sum(x["total"] for x in linhas)
    return {
        "mes": mes or "todos",
        "seguradora_id": seguradora_id,
        "verba_total": verba / 100,
        "usado_total": round(usado, 2),
        "percentual_usado": round(usado * 10000 / verba, 1) if verba else None,
        "saldo_restante": round(verba / 100 - usado, 2),
        "negocios_total": sum(x["negocios"] for x in linhas),
        "franqueados": linhas,
    }


@app.get("/admin/relatorio")
def relatorio(mes: Optional[str] = None, seguradora_id: Optional[str] = None, _: None = Depends(require_admin)):
    return _relatorio(_validar_mes(mes) if mes else _hoje_sp()[:7], seguradora_id or None)


@app.get("/admin/relatorio/export")
def relatorio_export(mes: Optional[str] = None, seguradora_id: Optional[str] = None, _: None = Depends(require_admin)):
    rel = _relatorio(_validar_mes(mes) if mes else _hoje_sp()[:7], seguradora_id or None)
    wb = Workbook()
    ws = wb.active
    ws.title = "Uso por franqueado"
    seg_nome = next((s["nome"] for s in _load(SEGURADORAS_FILE) if s["id"] == seguradora_id), "Todas")
    ws.append([f'Mês: {rel["mes"]} · Seguradora: {seg_nome} · Verba total: R$ {rel["verba_total"]:,.2f}'.replace(",", "X").replace(".", ",").replace("X", ".")])
    ws.append([])
    ws.append(["Franqueado", "Utilizado", "Reservado", "Total", "% da verba", "Nº de negócios",
               "Solic. aprovadas", "Solic. não aprovadas", "Solic. em análise", "Por seguradora"])
    for r in rel["franqueados"]:
        ws.append([
            r["franqueado"], r["utilizado"], r["reservado"], r["total"],
            (r["percentual"] or 0) / 100, r["negocios"], r["solic_aprovadas"], r["solic_reprovadas"], r["solic_pendentes"],
            "; ".join(f'{p["seguradora"]}: {p["valor"]:.2f}' for p in r["por_seguradora"]),
        ])
    brl = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
    for row in ws.iter_rows(min_row=4):
        for c in row[1:4]:
            c.number_format = brl
        row[4].number_format = "0.0%"
    for c in ws[3]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="072A3C")
    for col, w in zip("ABCDEFGHIJ", (36, 14, 14, 14, 11, 14, 15, 18, 16, 50)):
        ws.column_dimensions[col].width = w
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="relatorio-desconto-{rel["mes"]}.xlsx"'},
    )


# ---------------------------------------------------------------------------
# Relatório: verba recebida das seguradoras (créditos), mês a mês no ano
# ---------------------------------------------------------------------------

MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _relatorio_verba(ano: int) -> dict:
    seguradoras = _load(SEGURADORAS_FILE)
    lancamentos = _load(LANCAMENTOS_FILE)
    creditos = [l for l in lancamentos
                if l["tipo"] == "credito" and not l.get("estornado") and not _eh_teste(l.get("franqueado"))]
    anos = sorted({int(l["data"][:4]) for l in creditos} | {int(_hoje_sp()[:4])}, reverse=True)
    vazio = lambda: [0] * 12  # noqa: E731
    por_seg: dict[str, dict] = {}
    tot_geral, tot_esp = vazio(), vazio()
    especiais_ano: dict[str, int] = {}
    for l in creditos:
        if int(l["data"][:4]) != ano:
            continue
        m = int(l["data"][5:7]) - 1
        v = l["valor_centavos"]
        r = por_seg.setdefault(l["seguradora_id"], {"geral": vazio(), "especial": vazio(), "especiais": {}})
        if _cat(l):
            r["especial"][m] += v
            tot_esp[m] += v
            r["especiais"][_cat(l)] = r["especiais"].get(_cat(l), 0) + v
            especiais_ano[_cat(l)] = especiais_ano.get(_cat(l), 0) + v
        else:
            r["geral"][m] += v
            tot_geral[m] += v
    reais = lambda arr: [x / 100 for x in arr]  # noqa: E731
    linhas = []
    for seg in seguradoras:
        r = por_seg.get(seg["id"])
        if not r:
            continue
        total = [g + e for g, e in zip(r["geral"], r["especial"])]
        linhas.append({
            "id": seg["id"], "nome": seg["nome"], "logo_url": _logo_url(seg),
            "geral": reais(r["geral"]), "especial": reais(r["especial"]), "total": reais(total),
            "total_ano": sum(total) / 100, "geral_ano": sum(r["geral"]) / 100, "especial_ano": sum(r["especial"]) / 100,
            "especiais": [{"categoria": k, "valor": v / 100} for k, v in sorted(r["especiais"].items(), key=lambda x: -x[1])],
        })
    linhas.sort(key=lambda x: (-x["total_ano"], x["nome"].lower()))
    total_mes = [g + e for g, e in zip(tot_geral, tot_esp)]
    meses_com_verba = [x for x in total_mes if x]
    return {
        "ano": ano,
        "anos": anos,
        "meses": MESES_ABREV,
        "seguradoras": linhas,
        "totais_mes": {"geral": reais(tot_geral), "especial": reais(tot_esp), "total": reais(total_mes)},
        "total_ano": sum(total_mes) / 100,
        "geral_ano": sum(tot_geral) / 100,
        "especial_ano": sum(tot_esp) / 100,
        "media_mensal": round(sum(meses_com_verba) / len(meses_com_verba) / 100, 2) if meses_com_verba else 0,
        "especiais_ano": [{"categoria": k, "valor": v / 100} for k, v in sorted(especiais_ano.items(), key=lambda x: -x[1])],
    }


@app.get("/admin/relatorio/verba")
def relatorio_verba(ano: Optional[int] = None, _: None = Depends(require_admin)):
    return _relatorio_verba(ano or int(_hoje_sp()[:4]))


@app.get("/admin/relatorio/verba/export")
def relatorio_verba_export(ano: Optional[int] = None, _: None = Depends(require_admin)):
    rel = _relatorio_verba(ano or int(_hoje_sp()[:4]))
    wb = Workbook()
    ws = wb.active
    ws.title = f"Verba recebida {rel['ano']}"
    cab = ["Seguradora", "Verba"] + rel["meses"] + [f"Total {rel['ano']}"]
    ws.append(cab)
    for r in rel["seguradoras"]:
        ws.append([r["nome"], "Automóvel"] + r["geral"] + [r["geral_ano"]])
        if r["especial_ano"]:
            nomes_esp = ", ".join(e["categoria"] for e in r["especiais"])
            ws.append([r["nome"], f"Especial ({nomes_esp})"] + r["especial"] + [r["especial_ano"]])
        ws.append([r["nome"], "Total"] + r["total"] + [r["total_ano"]])
    t = rel["totais_mes"]
    ws.append(["TOTAL", "Automóvel"] + t["geral"] + [rel["geral_ano"]])
    ws.append(["TOTAL", "Especial"] + t["especial"] + [rel["especial_ano"]])
    ws.append(["TOTAL", "Total"] + t["total"] + [rel["total_ano"]])
    brl = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
    for row in ws.iter_rows(min_row=2, min_col=3):
        for c in row:
            c.number_format = brl
        if row[0].row and ws.cell(row[0].row, 2).value == "Total":
            for c in ws[row[0].row]:
                c.font = Font(bold=True)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="072A3C")
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 34
    for col in range(3, 3 + 13):
        ws.column_dimensions[ws.cell(1, col).column_letter].width = 14
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="verba-recebida-{rel["ano"]}.xlsx"'},
    )


TIPO_LABEL = {"credito": "Crédito", "utilizacao": "Utilização", "reserva": "Reserva"}
STATUS_LABEL = {"aberta": "Em aberto", "utilizada": "Utilizada", "cancelada": "Cancelada"}


def _br_date(iso: str) -> str:
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return iso


@app.get("/admin/export")
def export_excel(_: None = Depends(require_admin)):
    seguradoras = _load(SEGURADORAS_FILE)
    lancamentos = _load(LANCAMENTOS_FILE)
    nomes = {s["id"]: s["nome"] for s in seguradoras}

    wb = Workbook()
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="072A3C")
    brl = '"R$" #,##0.00;[Red]-"R$" #,##0.00'

    ws = wb.active
    ws.title = "Saldos"
    ws.append(["Seguradora", "Situação", "Saldo", "Reserva", "Liberado", "Saldo à utilizar"])
    for r in sorted((_resumo(s, lancamentos, _load(SOLICITACOES_FILE)) for s in seguradoras), key=lambda r: r["nome"].lower()):
        ws.append([r["nome"], "Ativa" if r["ativa"] else "Inativa", r["saldo"], r["reserva"], r["liberado"], r["saldo_a_utilizar"]])
    for row in ws.iter_rows(min_row=2, min_col=3, max_col=6):
        for c in row:
            c.number_format = brl

    ws2 = wb.create_sheet("Extrato")
    ws2.append(["Data", "Seguradora", "Verba", "Tipo", "Valor", "Situação", "Franqueado", "Descrição", "Lançado por",
                "Lançado em", "Observações"])
    for l in sorted(lancamentos, key=lambda l: (l["data"], l["created_at"])):
        if l.get("estornado"):
            situacao = "Estornado"
            obs = f'Estornado por {l.get("estornado_por", "")}: {l.get("estorno_motivo", "")}'
        elif l["tipo"] == "reserva":
            situacao = STATUS_LABEL.get(l.get("status", ""), "")
            obs = f'{situacao} por {l["status_por"]}' if l.get("status_por") else ""
            if l.get("status_motivo"):
                obs += f': {l["status_motivo"]}'
        else:
            situacao, obs = "", ""
        ws2.append([
            _br_date(l["data"]), nomes.get(l["seguradora_id"], "?"),
            f"Especial: {_cat(l)}" if _cat(l) else "Automóvel", TIPO_LABEL[l["tipo"]],
            l["valor_centavos"] / 100, situacao, l.get("franqueado", ""), l.get("descricao", ""),
            l.get("operador", ""),
            datetime.fromisoformat(l["created_at"]).astimezone(SP_TZ).strftime("%d/%m/%Y %H:%M"), obs,
        ])
    for row in ws2.iter_rows(min_row=2, min_col=5, max_col=5):
        for c in row:
            c.number_format = brl

    for sheet in (ws, ws2):
        for c in sheet[1]:
            c.font = header_font
            c.fill = header_fill
        for col in sheet.columns:
            width = max(len(str(c.value or "")) for c in col)
            sheet.column_dimensions[col[0].column_letter].width = min(max(width + 2, 12), 50)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"desconto-comercial-{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Backups
# ---------------------------------------------------------------------------


@app.get("/admin/backups")
def list_backups(_: None = Depends(require_admin)):
    if not BACKUPS_DIR.exists():
        return []
    dirs = sorted((p for p in BACKUPS_DIR.iterdir() if p.is_dir()), key=lambda p: p.stat().st_mtime, reverse=True)
    return [
        {"name": p.name, "criado_em": datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat()}
        for p in dirs
    ]


@app.post("/admin/backups/{name}/restore")
def restore_backup(name: str, _: None = Depends(require_admin)):
    snapshot_dir = BACKUPS_DIR / name
    if "/" in name or ".." in name or not snapshot_dir.is_dir():
        raise HTTPException(404, "Backup não encontrado")
    with _lock:
        seguranca = _snapshot("antes-restore-")  # restore errado também tem volta
        for filename in _DATA_FILES:
            src = snapshot_dir / filename
            if src.exists():
                shutil.copy2(src, DATA_DIR / filename)
        if (snapshot_dir / "logos").is_dir():
            shutil.copytree(snapshot_dir / "logos", LOGOS_DIR, dirs_exist_ok=True)
        _marcar_alteracao()
    return {"ok": True, "backup_seguranca": seguranca}
