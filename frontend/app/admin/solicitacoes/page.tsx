"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAoVivo } from "../../lib/aoVivo";
import Header from "../../components/Header";
import NovaReserva from "./NovaReserva";
import Historico from "../../components/Historico";
import Prazo from "../../components/Prazo";
import { apiJson } from "../../lib/api";
import { getOperador, isAdminLoggedIn } from "../../lib/auth";
import { SOLIC_STATUS, parseValor, formatBRL, formatDateTime, type Gestor, type Solicitacao, type StatusSolicitacao } from "../../lib/types";

const GESTOR_KEY = "desconto_filtro_gestor";
const FILTROS: { v: StatusSolicitacao | "todas"; label: string }[] = [
  { v: "pendente", label: "Pendentes" },
  { v: "aprovada", label: "Aprovadas" },
  { v: "reprovada", label: "Não aprovadas" },
  { v: "expirada", label: "Expiradas" },
  { v: "todas", label: "Todas" },
];

function CardSolicitacao({ s, onRespondida }: { s: Solicitacao; onRespondida: () => void }) {
  const [resposta, setResposta] = useState("");
  const [modoRessalva, setModoRessalva] = useState(false);
  const [valorRessalva, setValorRessalva] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const st = SOLIC_STATUS[s.status];
  const reservaGestor = s.origem === "gestor" && s.status === "pendente";
  const excede = s.saldo_a_utilizar_atual !== undefined && s.valor > s.saldo_a_utilizar_atual;

  // clique errado em "Proposta transmitida": volta para Aprovado (fica no histórico)
  async function desfazerTransmissao() {
    setErro("");
    const motivo = window.prompt(
      `Desfazer a "Proposta transmitida" da solicitação #${s.numero} (${formatBRL(s.valor)} · ${s.franqueado})?\n` +
        "O valor volta de Transmitido para Aprovado.\n\nInforme o motivo (fica no histórico):",
    );
    if (motivo === null) return;
    if (!motivo.trim()) {
      setErro("Informe o motivo.");
      return;
    }
    let operador = getOperador();
    if (!operador) {
      operador = window.prompt("Informe seu nome (fica registrado):")?.trim() ?? "";
      if (!operador) return;
      localStorage.setItem("desconto_operador", operador);
    }
    setEnviando(true);
    try {
      await apiJson(`/admin/solicitacoes/${s.id}/desfazer-transmitida`, {
        method: "POST",
        body: JSON.stringify({ operador, motivo }),
      });
      onRespondida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao desfazer");
    } finally {
      setEnviando(false);
    }
  }

  // só admin: devolve uma solicitação expirada para análise com novo prazo de 48h
  async function reabrir() {
    setErro("");
    const motivo = window.prompt(
      `Reabrir a solicitação #${s.numero} (${formatBRL(s.valor)} · ${s.franqueado}) com novo prazo de 48h?\n\n` +
        "Informe o motivo (fica no histórico):",
    );
    if (motivo === null) return;
    if (!motivo.trim()) {
      setErro("Informe o motivo para reabrir.");
      return;
    }
    let operador = getOperador();
    if (!operador) {
      operador = window.prompt("Informe seu nome (fica registrado):")?.trim() ?? "";
      if (!operador) return;
      localStorage.setItem("desconto_operador", operador);
    }
    setEnviando(true);
    try {
      await apiJson(`/admin/solicitacoes/${s.id}/reabrir`, { method: "POST", body: JSON.stringify({ operador, motivo }) });
      onRespondida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao reabrir");
    } finally {
      setEnviando(false);
    }
  }

  async function responder(decisao: "aprovar" | "reprovar" | "ressalva") {
    setErro("");
    if (decisao === "reprovar" && !resposta.trim()) {
      setErro("Escreva a justificativa para o franqueado antes de não aprovar.");
      return;
    }
    let valor_aprovado: number | undefined;
    if (decisao === "ressalva") {
      if (!resposta.trim()) {
        setErro("Escreva a ressalva para o franqueado (campo de resposta acima).");
        return;
      }
      const v = parseValor(valorRessalva);
      if (!Number.isFinite(v) || v <= 0) {
        setErro("Informe o valor aprovado (obrigatório na aprovação com ressalva).");
        return;
      }
      valor_aprovado = v;
      // passa do Disponível? (o próprio pedido já está na Reserva, por isso entra no cálculo)
      const disp = s.saldo_a_utilizar_atual ?? 0;
      if (v > disp) {
        const ok = window.confirm(
          `O valor aprovado (${formatBRL(v)}) é maior que o Disponível de ${s.seguradora_nome} (${formatBRL(disp)}). ` +
            "O saldo vai ficar negativo. Aprovar mesmo assim?",
        );
        if (!ok) return;
      }
    }
    if (decisao === "aprovar" && excede) {
      const ok = window.confirm(
        `O valor (${formatBRL(s.valor)}) é maior que o Disponível de ${s.seguradora_nome} ` +
          `(${formatBRL(s.saldo_a_utilizar_atual!)}). O saldo vai ficar negativo. Aprovar mesmo assim?`,
      );
      if (!ok) return;
    }
    let operador = getOperador();
    if (!operador) {
      operador = window.prompt("Informe seu nome (fica registrado na resposta):")?.trim() ?? "";
      if (!operador) return;
      localStorage.setItem("desconto_operador", operador);
    }
    setEnviando(true);
    try {
      await apiJson(`/admin/solicitacoes/${s.id}/responder`, {
        method: "POST",
        body: JSON.stringify({ decisao, resposta, operador, valor_aprovado }),
      });
      onRespondida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao responder");
      setEnviando(false);
    }
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${st.cor}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold" style={{ color: "#072a3c" }}>
            #{s.numero} · {s.seguradora_nome} · <span className="tabular-nums">{formatBRL(s.valor)}</span>
            {s.categoria && (
              <span
                className="ml-2 text-xs font-bold rounded-full px-2 py-0.5 align-middle"
                style={{ background: "#fff1e8", color: "#9a3412" }}
              >
                ★ Especial: {s.categoria}
              </span>
            )}
          </p>
          <p className="text-sm text-gray-600">
            {s.franqueado} → <strong>{s.gestor_nome}</strong>
          </p>
          {s.cotacao && (
            <p className="text-sm text-gray-600">
              Cotação nº <strong style={{ color: "#072a3c" }}>{s.cotacao}</strong>
            </p>
          )}
          <p className="text-xs text-gray-400">
            {s.origem === "gestor"
              ? `Registrada por ${s.criado_por} · pedido via ${s.canal} · ${formatDateTime(s.created_at)}`
              : `Enviada pelo franqueado em ${formatDateTime(s.created_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.teste && (
            <span className="text-xs font-bold rounded-full px-2.5 py-1" style={{ background: "#ede9fe", color: "#5b21b6" }}>
              🎓 TREINAMENTO
            </span>
          )}
          <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ color: st.cor, background: st.fundo }}>
            {reservaGestor ? "◷ Reserva · negociação em andamento" : st.label}
          </span>
          {s.ressalva && (
            <span className="text-xs font-bold rounded-full px-2.5 py-1" style={{ background: "#fff4dc", color: "#9a5b00" }}>
              ⚠ com ressalva{s.valor_aprovado ? ` · aprovado ${formatBRL(s.valor_aprovado)}` : ""}
            </span>
          )}
          {s.status === "aprovada" && s.expira_em && <Prazo expiraEm={s.expira_em} />}
        </div>
      </div>

      <div className="text-sm rounded-lg p-3 mb-3 whitespace-pre-wrap" style={{ background: "#f6f6f6" }}>
        <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Justificativa do franqueado</span>
        {s.observacao || <span className="text-gray-400">Sem observação.</span>}
        {s.nota_gestor && (
          <span className="block mt-2 pt-2 border-t border-gray-200">
            <span className="block text-xs uppercase tracking-wider text-gray-500">Observação da reserva ({s.criado_por})</span>
            {s.nota_gestor}
          </span>
        )}
      </div>

      {s.status === "expirada" && (
        <p
          className="text-sm rounded-lg px-3 py-2 mb-3"
          style={{ background: "#fdecea", color: "#b42318", border: "1px solid #f5c2bd" }}
        >
          <strong>⛔ Desconto expirado</strong>
          {s.expirada_em && ` em ${formatDateTime(s.expirada_em)}`} —{" "}
          {s.etapa_expirada === "aprovada"
            ? "o franqueado não marcou \"Proposta transmitida\" em 48h após a aprovação"
            : "expirou pela regra antiga (48h sem aprovação)"}
          ; o valor voltou para o Disponível. Fica registrado aqui como evidência.
          <button
            onClick={reabrir}
            disabled={enviando}
            className="block mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
            style={{ background: "#2a78d6" }}
          >
            ↺ Reabrir solicitação (+48h)
          </button>
          {erro && <span className="block text-xs text-red-600 mt-1">{erro}</span>}
        </p>
      )}

      {s.historico && s.historico.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setVerHistorico(!verHistorico)}
            className="text-xs font-semibold underline cursor-pointer"
            style={{ color: "#072a3c" }}
          >
            {verHistorico ? "▾ Ocultar histórico" : `▸ Ver histórico (${s.historico.length} registro${s.historico.length > 1 ? "s" : ""})`}
          </button>
          {verHistorico && (
            <div className="mt-2 rounded-lg p-3" style={{ background: "#fafaf8", border: "1px solid #e8e6df" }}>
              <Historico eventos={s.historico} />
            </div>
          )}
        </div>
      )}

      {s.status === "expirada" ? null : s.status === "pendente" ? (
        <>
          <p className="text-xs mb-2" style={{ color: excede ? "#b42318" : "#555" }}>
            Disponível hoje em {s.seguradora_nome}
            {s.categoria ? ` (desconto especial ${s.categoria})` : ""}: <strong>{formatBRL(s.saldo_a_utilizar_atual ?? 0)}</strong>
            {excede && " — valor solicitado excede o Disponível"}
          </p>
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            placeholder={
              modoRessalva
                ? "Escreva a ressalva (obrigatória) — ex.: aprovado só para a renovação da frota atual"
                : reservaGestor
                  ? "Mensagem ao franqueado (obrigatória se o negócio não fechou)"
                  : "Resposta ao franqueado (obrigatória para não aprovar ou para aprovar com ressalva)"
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          {erro && <p className="text-sm text-red-600 mb-2">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => responder("aprovar")}
              disabled={enviando}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
              style={{ background: "#1f7a4d" }}
            >
              {reservaGestor ? "✓ Negócio fechado — aprovar" : "✓ Aprovar"}
            </button>
            <button
              onClick={() => responder("reprovar")}
              disabled={enviando}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
              style={{ background: "#b42318" }}
            >
              {reservaGestor ? "✕ Não fechou — cancelar reserva" : "✕ Não aprovar"}
            </button>
            <button
              onClick={() => setModoRessalva(!modoRessalva)}
              disabled={enviando}
              className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer disabled:opacity-60"
              style={
                modoRessalva
                  ? { background: "#9a5b00", color: "#fff" }
                  : { background: "#fff4dc", color: "#9a5b00", border: "1px solid #e9c46a" }
              }
            >
              ⚠ Aprovado com ressalva
            </button>
          </div>
          {modoRessalva && (
            <div className="mt-3 rounded-lg p-3 flex flex-col gap-2" style={{ background: "#fff4dc", border: "1px solid #e9c46a" }}>
              <p className="text-xs" style={{ color: "#9a5b00" }}>
                Aprova com uma condição. A <strong>ressalva</strong> (texto acima) e o <strong>valor aprovado</strong> são
                obrigatórios. Se o valor for <strong>maior</strong> que o pedido, a diferença sai do Disponível; se for{" "}
                <strong>menor</strong>, a diferença volta para o Disponível.
              </p>
              <label className="text-sm font-medium flex flex-wrap items-center gap-2">
                Valor aprovado (R$) *
                <input
                  value={valorRessalva}
                  onChange={(e) => setValorRessalva(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 bg-white w-40"
                  required
                />
                <span className="text-xs text-gray-500">solicitado: {formatBRL(s.valor)}</span>
              </label>
              {(() => {
                const v = parseValor(valorRessalva);
                if (!Number.isFinite(v) || v <= 0) return null;
                const dif = v - s.valor;
                if (Math.abs(dif) < 0.005)
                  return <p className="text-xs text-gray-600">Mesmo valor do pedido — o Disponível não muda.</p>;
                return dif > 0 ? (
                  <p className="text-xs font-semibold" style={{ color: "#b42318" }}>
                    ▲ {formatBRL(dif)} acima do pedido — essa diferença sai do Disponível.
                  </p>
                ) : (
                  <p className="text-xs font-semibold" style={{ color: "#1f7a4d" }}>
                    ▼ {formatBRL(-dif)} abaixo do pedido — essa diferença volta para o Disponível.
                  </p>
                );
              })()}
              <div>
                <button
                  onClick={() => responder("ressalva")}
                  disabled={enviando}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
                  style={{ background: "#9a5b00" }}
                >
                  ⚠ Confirmar aprovação com ressalva
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-sm rounded-lg p-3 whitespace-pre-wrap" style={{ background: st.fundo }}>
          <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
            {s.ressalva ? "⚠ Ressalva do gestor" : "Resposta do gestor"} {s.gestor_nome}
            {s.respondido_por && s.respondido_por !== s.gestor_nome && ` (lançada por ${s.respondido_por})`} ·{" "}
            {s.respondido_em && formatDateTime(s.respondido_em)}
          </span>
          {s.resposta || "—"}
          {s.status === "aprovada" && (
            <span className="flex flex-wrap items-center gap-2 mt-2">
              {s.reserva_status === "utilizada" ? (
                <>
                  <span
                    className="text-xs font-bold rounded-full px-2.5 py-1"
                    style={{ background: "#e8f3ec", color: "#1f7a4d" }}
                  >
                    ✓ Proposta transmitida
                  </span>
                  <button
                    onClick={desfazerTransmissao}
                    disabled={enviando}
                    className="text-xs underline cursor-pointer disabled:opacity-60"
                    style={{ color: "#b45309" }}
                  >
                    Desfazer (voltar para Aprovado)
                  </button>
                </>
              ) : s.reserva_status === "aberta" ? (
                <span className="text-xs font-bold rounded-full px-2.5 py-1" style={{ background: "#e8f0fb", color: "#1d5fb8" }}>
                  Aprovado · aguardando o franqueado marcar &quot;Proposta transmitida&quot;
                </span>
              ) : (
                s.reserva_status && <span className="text-xs text-gray-500">Reserva {s.reserva_status}</span>
              )}
              <Link href={`/admin/seguradoras/${s.seguradora_id}`} className="text-xs underline" style={{ color: "#072a3c" }}>
                Ver na conta da seguradora
              </Link>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SolicitacoesPage() {
  const router = useRouter();
  const [lista, setLista] = useState<Solicitacao[] | null>(null);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [filtro, setFiltro] = useState<StatusSolicitacao | "todas">("pendente");
  const [gestor, setGestor] = useState("");
  const [erro, setErro] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [l, g] = await Promise.all([
        apiJson<Solicitacao[]>("/admin/solicitacoes"),
        apiJson<Gestor[]>("/admin/gestores"),
      ]);
      setLista(l);
      setGestores(g);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);
  useAoVivo(carregar);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
      return;
    }
    try {
      setGestor(localStorage.getItem(GESTOR_KEY) ?? "");
    } catch {}
    carregar();
  }, [router, carregar]);

  function escolherGestor(v: string) {
    setGestor(v);
    try {
      localStorage.setItem(GESTOR_KEY, v);
    } catch {}
  }

  const doGestor = (lista ?? []).filter((s) => !gestor || s.gestor_id === gestor);
  const visiveis = doGestor.filter((s) => filtro === "todas" || s.status === filtro);
  // fila de pendentes por ordem de chegada: quem pediu primeiro é analisado primeiro
  if (filtro === "pendente") visiveis.sort((a, b) => a.numero - b.numero);
  const contagem = (st: StatusSolicitacao | "todas") =>
    st === "todas" ? doGestor.length : doGestor.filter((s) => s.status === st).length;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="font-heading text-2xl" style={{ color: "#072a3c" }}>
            Solicitações de reserva
          </h1>
          {!novaAberta && (
            <button
              onClick={() => {
                setAviso("");
                setNovaAberta(true);
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
              style={{ background: "#c2a360", color: "#072a3c" }}
            >
              + Reservar para franqueado
            </button>
          )}
        </div>

        {(lista ?? []).some((s) => s.teste) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-2 mb-4 text-sm" style={{ background: "#ede9fe", color: "#4c1d95" }}>
            <span>
              🎓 Há {(lista ?? []).filter((s) => s.teste).length} solicitação(ões) de treinamento — não contam nos saldos reais.
            </span>
            <button
              onClick={async () => {
                if (!window.confirm("Apagar todas as solicitações e reservas do FRANQUEADO TESTE (treinamento)? Nada de franqueado real é afetado (fica um backup).")) return;
                try {
                  const r = await apiJson<{ solicitacoes: number }>("/admin/treinamento", { method: "DELETE" });
                  setAviso(`Dados de treinamento apagados (${r.solicitacoes} solicitação(ões)).`);
                  carregar();
                } catch (e) {
                  setErro(e instanceof Error ? e.message : "Erro ao limpar");
                }
              }}
              className="font-semibold underline cursor-pointer"
            >
              Limpar dados de treinamento
            </button>
          </div>
        )}
        {aviso && (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">✓ {aviso}</p>
        )}
        {novaAberta && (
          <NovaReserva
            gestores={gestores}
            onFechar={() => setNovaAberta(false)}
            onCriada={(msg) => {
              setNovaAberta(false);
              setAviso(msg);
              carregar();
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap gap-1 rounded-lg p-1 bg-white shadow-sm">
            {FILTROS.map((f) => (
              <button
                key={f.v}
                onClick={() => setFiltro(f.v)}
                className="rounded-md px-3 py-1.5 text-sm font-semibold cursor-pointer"
                style={filtro === f.v ? { background: "#072a3c", color: "white" } : { color: "#555" }}
              >
                {f.label} ({contagem(f.v)})
              </button>
            ))}
          </div>
          <select
            value={gestor}
            onChange={(e) => escolherGestor(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os gestores</option>
            {gestores.map((g) => (
              <option key={g.id} value={g.id}>
                Direcionadas a {g.nome}
              </option>
            ))}
          </select>
        </div>

        {gestores.length === 0 && lista && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            Nenhum gestor cadastrado — os franqueados não conseguem enviar solicitações até você cadastrar em{" "}
            <Link href="/admin/gestores" className="underline font-semibold">
              Gestores
            </Link>
            .
          </p>
        )}
        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {!lista && !erro && <p className="text-gray-500">Carregando...</p>}
        {lista && visiveis.length === 0 && (
          <p className="text-gray-500 bg-white rounded-xl p-6 shadow-sm">Nenhuma solicitação aqui.</p>
        )}
        <div className="flex flex-col gap-4">
          {visiveis.map((s) => (
            <CardSolicitacao key={s.id} s={s} onRespondida={carregar} />
          ))}
        </div>
      </main>
    </>
  );
}
