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
  const [verba, setVerba] = useState(""); // "" = geral; senão, desconto especial
  const [valor, setValor] = useState("");
  const [franqueado, setFranqueado] = useState("");
  const [canal, setCanal] = useState("WhatsApp");
  const [gestorId, setGestorId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [cotacao, setCotacao] = useState("");
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
  const especiais = seg?.especiais ?? [];
  const esp = especiais.find((e) => e.categoria === verba);
  const disponivel = esp ? esp.saldo_a_utilizar : (seg?.saldo_a_utilizar ?? 0);
  const v = parseValor(valor);
  const excede = seg && Number.isFinite(v) && v > disponivel;

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
          observacao, cotacao, canal, aprovar, resposta, operador, categoria: esp ? verba : "",
        }),
      });
      onCriada(
        aprovar
          ? `Reserva #${s.numero} de ${formatBRL(v)} para ${franqueado} criada e liberada. Já aparece no painel do franqueado.`
          : `Reserva #${s.numero} de ${formatBRL(v)} para ${franqueado} feita. Quando o negócio fechar, aprove em Pendentes.`,
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
          <select
            value={segId}
            onChange={(e) => {
              setSegId(e.target.value);
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
              <Logo nome={seg.nome} url={seg.logo_url} size={24} />
              Saldo à utilizar agora{esp ? ` (${esp.categoria})` : ""}:{" "}
              <strong style={{ color: "#072a3c" }}>{formatBRL(disponivel)}</strong>
            </div>
          )}
          {especiais.length > 0 && (
            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">De qual verba? *</label>
              <select value={verba} onChange={(e) => setVerba(e.target.value)} className={input}>
                <option value="">Automóvel — disponível {formatBRL(seg!.saldo_a_utilizar)}</option>
                {especiais.map((e) => (
                  <option key={e.categoria} value={e.categoria}>
                    ★ Desconto especial: {e.categoria} — disponível {formatBRL(e.saldo_a_utilizar)}
                  </option>
                ))}
              </select>
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
        <div>
          <label className="block text-sm font-medium mb-1">Número da cotação *</label>
          <input
            value={cotacao}
            onChange={(e) => setCotacao(e.target.value)}
            placeholder="Ex.: 123456789"
            maxLength={40}
            className={input}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Justificativa do franqueado *</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="O que o franqueado explicou no WhatsApp (cliente, negócio...)"
            className={input}
            required
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="block text-sm font-medium mb-2">Situação *</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              v: true,
              titulo: "✓ Já aprovar e liberar agora",
              texto: "Negócio fechado: o valor vai direto para Liberado.",
              cor: "#1f7a4d",
              fundo: "#e8f3ec",
            },
            {
              v: false,
              titulo: "◷ Reserva",
              texto: "Negociação ainda em andamento: o valor fica separado em Reserva. Quando o franqueado fechar o negócio, você aprova em Pendentes.",
              cor: "#8a6a1f",
              fundo: "#fbf3e0",
            },
          ].map((o) => {
            const ativo = aprovar === o.v;
            return (
              <label
                key={String(o.v)}
                className="rounded-lg p-3 cursor-pointer flex gap-2 items-start"
                style={{ background: ativo ? o.fundo : "#f6f6f6", outline: ativo ? `2px solid ${o.cor}` : "1px solid #e8e6df" }}
              >
                <input type="radio" name="situacao" checked={ativo} onChange={() => setAprovar(o.v)} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold" style={{ color: o.cor }}>
                    {o.titulo}
                  </span>
                  <span className="block text-xs text-gray-600 mt-0.5">{o.texto}</span>
                </span>
              </label>
            );
          })}
        </div>
        <textarea
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          rows={2}
          placeholder={
            aprovar
              ? "Mensagem ao franqueado (opcional) — aparece no painel"
              : "Observação da reserva (opcional), ex.: aguardando o cliente assinar"
          }
          className={`${input} mt-3 text-sm`}
        />
      </fieldset>

      {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="mt-4 rounded-lg px-5 py-2.5 font-semibold text-white cursor-pointer disabled:opacity-60"
        style={{ background: aprovar ? "#1f7a4d" : "#8a6a1f" }}
      >
        {enviando ? "Salvando..." : aprovar ? "✓ Aprovar e liberar" : "◷ Fazer a reserva"}
      </button>
    </form>
  );
}
