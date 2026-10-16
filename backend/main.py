import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
_BACKUP_FILES = ["seguradoras.json", "lancamentos.json", "admin.json"]

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


class AcaoOperador(BaseModel):
    operador: str
    motivo: str = ""


# ---------------------------------------------------------------------------
# Cálculo de saldos
# ---------------------------------------------------------------------------


def _cents(valor: float) -> int:
    return int(round(valor * 100))


def _resumo(seguradora: dict, lancamentos: list[dict]) -> dict:
    creditos = utilizado = reservado = 0
    ultimo = None
    for l in lancamentos:
        if l["seguradora_id"] != seguradora["id"]:
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
                reservado += l["valor_centavos"]
            elif l.get("status") == "utilizada":
                utilizado += l["valor_centavos"]
    saldo = creditos - utilizado
    return {
        "id": seguradora["id"],
        "nome": seguradora["nome"],
        "ativa": seguradora.get("ativa", True),
        "creditos": creditos / 100,
        "utilizado": utilizado / 100,
        "saldo": saldo / 100,
        "reserva": reservado / 100,
        "saldo_a_utilizar": (saldo - reservado) / 100,
        "atualizado_em": ultimo or seguradora.get("created_at"),
    }


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


@app.get("/painel")
def painel():
    """Painel aberto aos franqueados: só os números por seguradora ativa."""
    seguradoras = _load(SEGURADORAS_FILE)
    lancamentos = _load(LANCAMENTOS_FILE)
    linhas = [_resumo(s, lancamentos) for s in seguradoras if s.get("ativa", True)]
    linhas.sort(key=lambda r: r["nome"].lower())
    publicas = [
        {k: r[k] for k in ("id", "nome", "saldo", "reserva", "saldo_a_utilizar", "atualizado_em")}
        for r in linhas
    ]
    return {
        "seguradoras": publicas,
        "totais": {
            "saldo": round(sum(r["saldo"] for r in linhas), 2),
            "reserva": round(sum(r["reserva"] for r in linhas), 2),
            "saldo_a_utilizar": round(sum(r["saldo_a_utilizar"] for r in linhas), 2),
        },
        "atualizado_em": max((r["atualizado_em"] or "" for r in linhas), default=None) or None,
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
def list_seguradoras(_: None = Depends(require_admin)):
    seguradoras = _load(SEGURADORAS_FILE)
    lancamentos = _load(LANCAMENTOS_FILE)
    linhas = [_resumo(s, lancamentos) for s in seguradoras]
    linhas.sort(key=lambda r: (not r["ativa"], r["nome"].lower()))
    return linhas


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


@app.get("/admin/seguradoras/{seg_id}")
def get_seguradora(seg_id: str, _: None = Depends(require_admin)):
    seguradoras = _load(SEGURADORAS_FILE)
    seg = _seguradora_or_404(seguradoras, seg_id)
    lancamentos = _load(LANCAMENTOS_FILE)
    extrato = [_public_lancamento(l) for l in lancamentos if l["seguradora_id"] == seg_id]
    extrato.sort(key=lambda l: (l["data"], l["created_at"]), reverse=True)
    return {"resumo": _resumo(seg, lancamentos), "lancamentos": extrato}


@app.post("/admin/seguradoras/{seg_id}/lancamentos", status_code=201)
def create_lancamento(seg_id: str, body: LancamentoIn, _: None = Depends(require_admin)):
    operador = _operador(body.operador)
    data = body.data or datetime.now(timezone.utc).date().isoformat()
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
    ws.append(["Seguradora", "Situação", "Saldo", "Reserva", "Saldo à utilizar"])
    for r in sorted((_resumo(s, lancamentos) for s in seguradoras), key=lambda r: r["nome"].lower()):
        ws.append([r["nome"], "Ativa" if r["ativa"] else "Inativa", r["saldo"], r["reserva"], r["saldo_a_utilizar"]])
    for row in ws.iter_rows(min_row=2, min_col=3, max_col=5):
        for c in row:
            c.number_format = brl

    ws2 = wb.create_sheet("Extrato")
    ws2.append(["Data", "Seguradora", "Tipo", "Valor", "Situação", "Franqueado", "Descrição", "Lançado por", "Observações"])
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
            _br_date(l["data"]), nomes.get(l["seguradora_id"], "?"), TIPO_LABEL[l["tipo"]],
            l["valor_centavos"] / 100, situacao, l.get("franqueado", ""), l.get("descricao", ""),
            l.get("operador", ""), obs,
        ])
    for row in ws2.iter_rows(min_row=2, min_col=4, max_col=4):
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
        for filename in ("seguradoras.json", "lancamentos.json"):
            src = snapshot_dir / filename
            if src.exists():
                shutil.copy2(src, DATA_DIR / filename)
    return {"ok": True, "backup_seguranca": seguranca}
