"use client";

import { useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { API, apiJson } from "../../lib/api";
import { getOperador } from "../../lib/auth";
import { formatBRL, mesAtual, parseValor, type Gestor, type Resumo } from "../../lib/types";

const CANAIS = ["WhatsApp", "Telefone", "E-mail", "Presencial", "Outro"];
const input = "w-full border border-gray-300 rounded-lg px-3 py-2 bg-white";

/** Gestor registra a reserva em nome do franqueado (pedido por WhatsApp, telefone...). */
export default function NovaReserva({ gestores, onCriada, onFechar }: {
  gestores: Gestor[];
  onCriada: (msg: string) => void;
  onFechar: () => void;
}) {
  const [seguradoras, setSeguradoras] = useState<Resumo[]>([]);
  const [franqueados, setFranqueados] = useState<string[]>([]);
  const [segId, setSegId] = useState("");
  const [valor, setValor] = useState("");
  const [franqueado, setFranqueado] = useState("");
  const [canal, setCanal] = useState("WhatsApp");
  const [gestorId, setGestorId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [aprovar, setAprovar] = useState(true);
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiJson<Resumo[]>(`/admin/seguradoras?mes=${mesAtual()}`)
      .then((l) => setSeguradoras(l.filter((s) => s.ativa)))
      .catch(() => {});
    fetch(`${API}/franqueados-lista`)
      .then((r) => r.json())
      .then((f) => setFranqueados(Array.isArray(f) ? f : []))
      .catch(() => {});
  }, []);

  // gestor responsável já vem como o operador logado, se o nome bater
  useEffect(() => {
    if (gestorId) return;
    const op = getOperador().toLowerCase();
    const ativos = gestores.filter((g) => g.ativo !== false);
    const meu = ativos.find((g) => op && (g.nome.toLowerCase().startsWith(op) || op.startsWith(g.nome.toLowerCase().split(" ")[0])));
    if (meu) setGestorId(meu.id);
  }, [gestores, gestorId]);

  const seg = seguradoras.find((s) => s.id === segId);
  const v = parseValor(valor);
  const excede = seg && Number.isFinite(v) && v > seg.saldo_a_utilizar;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe um valor válido maior que zero (ex.: 1.500,00).");
      return;
    }
    if (excede && !window.confirm(`O valor passa do saldo à utilizar de ${seg!.nome} (${formatBRL(seg!.saldo_a_utilizar)}). Continuar?`))
      return;
    let operador = getOperador();
    if (!operador) {
      operador = window.prompt("Informe seu nome (fica registrado):")?.trim() ?? "";
      if (!operador) return;
      localStorage.setItem("desconto_operador", operador);
    }
    setEnviando(true);
    try {
      const s = await apiJson<{ numero: number }>("/admin/solicitacoes", {
        method: "POST",
        body: JSON.stringify({
          seguradora_id: segId, valor: v, franqueado, gestor_id: gestorId,
          observacao, canal, aprovar, resposta, operador,
        }),
      });
      onCriada(
        aprovar
          ? `Reserva #${s.numero} de ${formatBRL(v)} para ${franqueado} criada e liberada. Já aparece no painel do franqueado.`
          : `Solicitação #${s.numero} de ${formatBRL(v)} para ${franqueado} registrada em análise.`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="bg-white rounded-xl p-5 shadow-sm mb-6" style={{ borderTop: "4px solid #c2a360" }}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
          Reservar para um franqueado
        </h2>
        <button type="button" onClick={onFechar} className="text-sm text-gray-500 hover:underline cursor-pointer">
          Fechar
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Para pedidos que chegam por WhatsApp, telefone etc. Fica registrado quem lançou e por onde veio o pedido.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Seguradora *</label>
          <select value={segId} onChange={(e) => setSegId(e.target.value)} className={input} required>
            <option value="">Selecione...</option>
            {seguradoras.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} — disponível {formatBRL(s.saldo_a_utilizar)}
              </option>
            ))}
          </select>
          {seg && (
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
              <Logo nome={seg.nome} url={seg.logo_url} size={24} />
              Saldo à utilizar agora: <strong style={{ color: "#072a3c" }}>{formatBRL(seg.saldo_a_utilizar)}</strong>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Franqueado *</label>
          {franqueados.length > 0 ? (
            <select value={franqueado} onChange={(e) => setFranqueado(e.target.value)} className={input} required>
              <option value="">Selecione...</option>
              {franqueados.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          ) : (
            <input value={franqueado} onChange={(e) => setFranqueado(e.target.value)} className={input} required />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Valor (R$) *</label>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={input} required />
          {excede && <p className="text-xs text-amber-700 mt-1">Maior que o saldo à utilizar desta seguradora.</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Pedido recebido por</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value)} className={input}>
            {CANAIS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Gestor responsável *</label>
          <select value={gestorId} onChange={(e) => setGestorId(e.target.value)} className={input} required>
            <option value="">Selecione...</option>
            {gestores
              .filter((g) => g.ativo !== false)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Justificativa do franqueado</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="O que o franqueado explicou no WhatsApp (cliente, negócio...)"
            className={input}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg p-3" style={{ background: "#f6f6f6" }}>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={aprovar} onChange={(e) => setAprovar(e.target.checked)} />
          Já aprovar e liberar agora
        </label>
        {aprovar ? (
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={2}
            placeholder="Resposta ao franqueado (opcional) — aparece no painel"
            className={`${input} mt-2 text-sm`}
          />
        ) : (
          <p className="text-xs text-gray-500 mt-1">Fica em análise na fila de Pendentes, como um pedido feito pelo próprio franqueado.</p>
        )}
      </div>

      {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="mt-4 rounded-lg px-5 py-2.5 font-semibold text-white cursor-pointer disabled:opacity-60"
        style={{ background: aprovar ? "#1f7a4d" : "#072a3c" }}
      >
        {enviando ? "Salvando..." : aprovar ? "✓ Reservar e liberar" : "Registrar em análise"}
      </button>
    </form>
  );
}
