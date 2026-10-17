"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "../components/Logo";
import { API } from "../lib/api";
import { addMinha } from "../lib/minhas";
import { FRANQUEADO_TESTE, formatBRL, parseValor, type Gestor, type PainelPublico, type Solicitacao } from "../lib/types";

const FRANQ_KEY = "desconto_franqueado";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [seguradoras, setSeguradoras] = useState<PainelPublico["seguradoras"]>([]);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [franqueados, setFranqueados] = useState<string[]>([]);
  const [carregado, setCarregado] = useState(false);

  const [seguradoraId, setSeguradoraId] = useState(params.get("seguradora") ?? "");
  const [verba, setVerba] = useState(params.get("verba") ?? ""); // "" = geral; senão, desconto especial
  const [valor, setValor] = useState("");
  const [franqueado, setFranqueado] = useState("");
  const [gestorId, setGestorId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    try {
      setFranqueado(localStorage.getItem(FRANQ_KEY) ?? "");
    } catch {}
    Promise.all([
      fetch(`${API}/painel`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${API}/gestores`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${API}/franqueados-lista`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([p, g, f]) => {
        setSeguradoras(p.seguradoras);
        setGestores(g);
        setFranqueados(Array.isArray(f) ? f : []);
      })
      .catch(() => setErro("Não foi possível carregar o formulário. Tente novamente em instantes."))
      .finally(() => setCarregado(true));
  }, []);

  const seg = seguradoras.find((s) => s.id === seguradoraId);
  const especiais = seg?.especiais ?? [];
  const esp = especiais.find((e) => e.categoria === verba);
  // disponível da verba escolhida (geral ou o desconto especial)
  const disponivel = esp ? esp.saldo_a_utilizar : seg?.saldo_a_utilizar;
  const v = parseValor(valor);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe um valor válido maior que zero (ex.: 1.500,00).");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`${API}/solicitacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seguradora_id: seguradoraId,
          valor: v,
          franqueado,
          gestor_id: gestorId,
          observacao,
          categoria: esp ? verba : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Verifique os campos");
      const s = data as Solicitacao;
      addMinha({ id: s.id, numero: s.numero });
      try {
        localStorage.setItem(FRANQ_KEY, franqueado);
      } catch {}
      router.push(`/solicitacao/${s.id}?nova=1`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar");
      setEnviando(false);
    }
  }

  const input = "w-full border border-gray-300 rounded-lg px-3 py-2 bg-white";

  return (
    <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← Voltar ao painel
      </Link>
      <h1 className="font-heading text-2xl mt-2 mb-1" style={{ color: "#072a3c" }}>
        Solicitar reserva de verba
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        O gestor escolhido analisa e responde por aqui. Depois de enviar você recebe um número de protocolo para acompanhar.
      </p>

      {!carregado ? (
        <p className="text-gray-500">Carregando...</p>
      ) : (
        <form onSubmit={enviar} className="bg-white rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Seguradora *</label>
            <select
              value={seguradoraId}
              onChange={(e) => {
                setSeguradoraId(e.target.value);
                setVerba("");
              }}
              className={input}
              required
            >
              <option value="">Selecione...</option>
              {seguradoras.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} — disponível {formatBRL(s.saldo_a_utilizar)}
                </option>
              ))}
            </select>
            {seg && (
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                <Logo nome={seg.nome} url={seg.logo_url} size={28} />
                Saldo à utilizar{esp ? ` (${esp.categoria})` : ""}:{" "}
                <strong style={{ color: "#072a3c" }}>{formatBRL(disponivel ?? 0)}</strong>
              </div>
            )}
          </div>

          {especiais.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">De qual verba? *</label>
              <select value={verba} onChange={(e) => setVerba(e.target.value)} className={input}>
                <option value="">Automóvel — disponível {formatBRL(seg!.saldo_a_utilizar)}</option>
                {especiais.map((e) => (
                  <option key={e.categoria} value={e.categoria}>
                    ★ Desconto especial: {e.categoria} — disponível {formatBRL(e.saldo_a_utilizar)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Desconto especial é para um produto específico e tem saldo próprio, separado do Automóvel.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Valor solicitado (R$) *</label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={input}
              required
            />
            {seg && Number.isFinite(v) && v > (disponivel ?? 0) && (
              <p className="text-xs text-amber-700 mt-1">
                O valor é maior que o saldo à utilizar desta seguradora. Você pode enviar, mas a aprovação depende do gestor.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Franqueado *</label>
            {franqueados.length > 0 ? (
              <select value={franqueado} onChange={(e) => setFranqueado(e.target.value)} className={input} required>
                <option value="">Selecione sua unidade...</option>
                {franqueados.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={franqueado}
                onChange={(e) => setFranqueado(e.target.value)}
                placeholder="Nome da sua unidade"
                className={input}
                required
              />
            )}
          </div>

          {franqueado === FRANQUEADO_TESTE && (
            <p className="text-sm rounded-lg px-3 py-2" style={{ background: "#ede9fe", color: "#4c1d95" }}>
              🎓 <strong>Treinamento:</strong> esta solicitação é uma simulação e não altera o saldo real da seguradora.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Direcionar para o gestor *</label>
            <select value={gestorId} onChange={(e) => setGestorId(e.target.value)} className={input} required>
              <option value="">Selecione o gestor comercial...</option>
              {gestores.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            {gestores.length === 0 && (
              <p className="text-xs text-red-600 mt-1">Nenhum gestor cadastrado ainda. Fale com a equipe Piaseg.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Observação / justificativa</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={4}
              placeholder="Ex.: cliente com frota de 10 veículos, concorrência ofereceu 15% abaixo..."
              className={input}
            />
          </div>

          {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

          <button
            type="submit"
            disabled={enviando || gestores.length === 0}
            className="rounded-lg py-3 font-semibold text-white cursor-pointer disabled:opacity-60"
            style={{ background: "#072a3c" }}
          >
            {enviando ? "Enviando..." : "Enviar solicitação"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function SolicitarPage() {
  return (
    <>
      <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href="/" className="font-heading text-lg" style={{ color: "#c2a360" }}>
            Desconto Comercial
          </Link>
        </div>
      </header>
      <Suspense>
        <Formulario />
      </Suspense>
    </>
  );
}
