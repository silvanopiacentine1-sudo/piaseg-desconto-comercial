"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Logo from "./components/Logo";
import Prazo from "./components/Prazo";
import SeletorMes from "./components/SeletorMes";
import { API } from "./lib/api";
import { useAoVivo } from "./lib/aoVivo";
import { getMinhas } from "./lib/minhas";
import {
  ESPECIAL_COR,
  FRANQUEADO_TESTE,
  RESSALVA_COR,
  SITUACAO,
  nomeVerba,
  type Especial,
  SOLIC_STATUS,
  formatBRL,
  formatDate,
  formatDateTime,
  formatMes,
  mesAtual,
  type Movimento,
  type PainelPublico,
  type ResumoPublico,
  type Solicitacao,
} from "./lib/types";

const SEG_KEY = "desconto_seguradora_escolhida";
const TREINO_KEY = "desconto_modo_treino";

function Valor({ v, destaque = false }: { v: number; destaque?: boolean }) {
  return (
    <span
      className={`tabular-nums whitespace-nowrap ${destaque ? "font-bold" : ""}`}
      style={{ color: v < 0 ? "#b42318" : destaque ? "#072a3c" : undefined }}
    >
      {formatBRL(v)}
    </span>
  );
}

function Badge({ situacao, label }: { situacao: Movimento["situacao"]; label?: string }) {
  const s = SITUACAO[situacao];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ color: s.cor, background: s.fundo }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: s.cor }} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

function PropostaTransmitida({ m, onMudou }: { m: Movimento; onMudou: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  if (m.situacao === "aprovada_utilizada") {
    return (
      <span
        className="inline-flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-1.5"
        style={{ background: "#e8f3ec", color: "#1f7a4d", border: "1px solid #b7e0c6" }}
      >
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded"
          style={{ background: "#1f7a4d", color: "#fff" }}
          aria-hidden
        >
          ✓
        </span>
        Proposta transmitida
        {m.transmitida_em && <span className="font-normal text-xs"> · {formatDateTime(m.transmitida_em)}</span>}
      </span>
    );
  }
  if (!m.pode_transmitir) return null;

  async function marcar() {
    const ok = window.confirm(
      `Confirma que a proposta ${m.cotacao ? `da cotação ${m.cotacao} ` : ""}(${formatBRL(m.valor)} · ${m.franqueado}) ` +
        "foi transmitida para a seguradora?\n\nO valor sai de Aprovado e vai para Transmitido.",
    );
    if (!ok) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch(`${API}/solicitacoes/${m.id}/transmitida`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Erro");
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao marcar");
    } finally {
      setEnviando(false); // não deixa o botão preso em "Marcando..." (ex.: se o admin desfizer depois)
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        onClick={marcar}
        disabled={enviando}
        className="inline-flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-1.5 cursor-pointer disabled:opacity-60"
        style={{ background: "#ffffff", color: "#1f7a4d", border: "2px solid #1f7a4d" }}
        title="Clique quando a proposta for transmitida para a seguradora"
      >
        <span className="inline-block w-5 h-5 rounded border-2" style={{ borderColor: "#1f7a4d" }} aria-hidden />
        {enviando ? "Marcando..." : "Proposta transmitida"}
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  );
}

function LinhaMovimento({ m, fila, onMudou }: { m: Movimento; fila?: number; onMudou: () => void }) {
  const s = SITUACAO[m.situacao];
  const titulo =
    m.situacao === "credito"
      ? m.descricao || "Crédito de verba da seguradora"
      : m.franqueado || "Franqueado não informado";
  const semEfeito = m.efeito === 0;
  return (
    <li className="py-4 flex flex-col gap-2" style={{ borderLeft: `4px solid ${s.cor}`, paddingLeft: 12 }}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: "#072a3c" }}>
            {titulo}
          </p>
          <p className="text-xs text-gray-500">
            {formatDate(m.data)}
            {m.numero && ` · Solicitação #${m.numero}`}
            {m.cotacao && ` · Cotação ${m.cotacao}`}
            {m.gestor_nome && !m.criado_por && ` · para ${m.gestor_nome}`}
            {m.criado_por && ` · pedido via ${m.canal}, reservado pelo gestor ${m.gestor_nome}`}
            {m.origem === "lancamento" && m.situacao !== "credito" && m.descricao && ` · ${m.descricao}`}
          </p>
        </div>
        <div className="sm:text-right">
          <p
            className={`font-bold tabular-nums whitespace-nowrap ${semEfeito ? "line-through text-gray-400" : ""}`}
            style={semEfeito ? undefined : { color: m.efeito > 0 ? "#1f7a4d" : "#072a3c" }}
          >
            {m.efeito > 0 ? "+ " : semEfeito ? "" : "− "}
            {formatBRL(m.valor)}
          </p>
          {m.valor_solicitado && (
            <p className="text-xs whitespace-nowrap" style={{ color: RESSALVA_COR.cor }}>
              solicitado {formatBRL(m.valor_solicitado)} · aprovado com ressalva
            </p>
          )}
          <p className="text-xs text-gray-500 whitespace-nowrap">
            {m.categoria ? `Disponível ${m.categoria}` : "Disponível"}: <span className="tabular-nums">{formatBRL(m.saldo_apos)}</span>
          </p>
        </div>
      </div>
      <div>
        <span className="flex flex-wrap gap-2">
          <Badge
            situacao={m.situacao}
            label={
              m.situacao === "em_analise" && m.criado_por
                ? "Reserva · negociação em andamento"
                : m.ressalva && m.situacao === "aprovada"
                  ? "⚠ Aprovada com ressalva · aguardando transmissão"
                  : undefined
            }
          />
          {m.categoria && <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: ESPECIAL_COR.fundo, color: ESPECIAL_COR.cor }}>★ {nomeVerba(m.categoria)}</span>}
          {fila && (
            <span
              className="text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
              style={{ background: "#072a3c", color: "#ffffff" }}
              title="Posição na fila de análise: quem solicitou primeiro tem a preferência"
            >
              {fila}º na fila
            </span>
          )}
          {m.expira_em && <Prazo expiraEm={m.expira_em} />}
          {m.teste && <span className="text-xs font-bold rounded-full px-2 py-0.5" style={{ background: "#ede9fe", color: "#5b21b6" }}>🎓 TREINAMENTO</span>}
        </span>
      </div>
      {m.origem === "solicitacao" && (m.pode_transmitir || m.situacao === "aprovada_utilizada") && (
        <div>
          <PropostaTransmitida m={m} onMudou={onMudou} />
        </div>
      )}
      {m.situacao === "expirada" && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          style={{ background: "#fdecea", color: "#b42318", border: "1px solid #f5c2bd" }}
        >
          <strong>⛔ Desconto expirado</strong>
          {m.expirada_em && ` em ${formatDateTime(m.expirada_em)}`}: a proposta não foi marcada como transmitida em
          48h após a aprovação e o valor voltou para o saldo.
        </p>
      )}
      {m.observacao && (
        <p className="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ background: "#f6f6f6" }}>
          <span className="block text-xs uppercase tracking-wider text-gray-500">Justificativa do franqueado</span>
          {m.observacao}
        </p>
      )}
      {m.nota_gestor && m.situacao === "em_analise" && (
        <p className="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ background: "#fbf3e0" }}>
          <span className="block text-xs uppercase tracking-wider" style={{ color: "#8a6a1f" }}>
            Observação do gestor {m.gestor_nome}
          </span>
          {m.nota_gestor}
        </p>
      )}
      {m.origem === "solicitacao" && m.situacao !== "em_analise" && (m.resposta || m.respondido_por) && (
        <p
          className="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap"
          style={
            m.ressalva
              ? { background: RESSALVA_COR.fundo, border: "1px solid #e9c46a" }
              : { background: s.fundo }
          }
        >
          <span className="block text-xs uppercase tracking-wider" style={{ color: m.ressalva ? RESSALVA_COR.cor : s.cor }}>
            {m.ressalva ? "⚠ Ressalva do gestor" : "Resposta do gestor"} {m.gestor_nome}
            {m.respondido_em && ` · ${formatDateTime(m.respondido_em)}`}
          </span>
          {m.resposta || (m.situacao === "reprovada" ? "Não aprovado." : m.situacao === "cancelada" ? "Cancelado." : "Aprovado.")}
        </p>
      )}
    </li>
  );
}

function MinhasSolicitacoes() {
  const [itens, setItens] = useState<Solicitacao[]>([]);

  const carregar = useCallback(() => {
    const minhas = getMinhas();
    if (minhas.length === 0) return;
    Promise.all(
      minhas.map((m) =>
        fetch(`${API}/solicitacoes/${m.id}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((r) => setItens(r.filter(Boolean)));
  }, []);

  useEffect(carregar, [carregar]);
  useAoVivo(carregar);

  if (itens.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-heading text-lg mb-3" style={{ color: "#072a3c" }}>
        Minhas solicitações
      </h2>
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {itens.map((s) => (
          <Link
            key={s.id}
            href={`/solicitacao/${s.id}`}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-[#f6f6f6]"
          >
            <span className="text-sm">
              <strong>#{s.numero}</strong> · {s.seguradora_nome} · {formatBRL(s.valor)}
              <span className="text-gray-500"> · {s.franqueado}</span>
            </span>
            <span
              className="text-xs font-semibold rounded-full px-2.5 py-1"
              style={{ color: SOLIC_STATUS[s.status].cor, background: SOLIC_STATUS[s.status].fundo }}
            >
              {s.status === "aprovada" && s.reserva_status === "utilizada"
                ? "✓ Proposta transmitida"
                : s.status === "aprovada" && s.ressalva
                  ? "⚠ Aprovada com ressalva"
                  : SOLIC_STATUS[s.status].label}
            </span>
            {s.status === "pendente" && s.expira_em && <Prazo expiraEm={s.expira_em} compacto />}
          </Link>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">Aparecem aqui as solicitações feitas neste navegador.</p>
    </section>
  );
}

export default function PainelPage() {
  const [mes, setMes] = useState(mesAtual());
  const [treino, setTreino] = useState(false);

  // modo treinamento: ?treino=1 no link ou ligado pelo botão (vale na sessão da aba)
  useEffect(() => {
    try {
      const url = new URLSearchParams(window.location.search).get("treino") === "1";
      if (url || sessionStorage.getItem(TREINO_KEY) === "1") setTreino(true);
    } catch {}
  }, []);

  function alternarTreino() {
    const novo = !treino;
    setTreino(novo);
    try {
      sessionStorage.setItem(TREINO_KEY, novo ? "1" : "0");
    } catch {}
  }
  const [painel, setPainel] = useState<PainelPublico | null>(null);
  const [segId, setSegId] = useState("");
  const [detalhe, setDetalhe] = useState<{ resumo: ResumoPublico; especiais?: Especial[]; movimentos: Movimento[] } | null>(
    null,
  );
  const [erro, setErro] = useState("");

  const carregarPainel = useCallback(async () => {
    try {
      const res = await fetch(`${API}/painel?mes=${mes}${treino ? "&treino=true" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const p: PainelPublico = await res.json();
      setPainel(p);
      setErro("");
      setSegId((atual) => {
        if (atual && p.seguradoras.some((s) => s.id === atual)) return atual;
        let lembrada = "";
        try {
          lembrada = localStorage.getItem(SEG_KEY) ?? "";
        } catch {}
        return p.seguradoras.some((s) => s.id === lembrada) ? lembrada : (p.seguradoras[0]?.id ?? "");
      });
    } catch {
      setErro("Não foi possível carregar os saldos. Tente atualizar a página em instantes.");
    }
  }, [mes, treino]);

  const carregarDetalhe = useCallback(async () => {
    if (!segId) {
      setDetalhe(null);
      return;
    }
    try {
      const res = await fetch(`${API}/painel/${segId}?mes=${mes}${treino ? "&treino=true" : ""}`, { cache: "no-store" });
      if (res.ok) setDetalhe(await res.json());
    } catch {}
  }, [segId, mes, treino]);

  useEffect(() => {
    carregarPainel();
  }, [carregarPainel]);

  useEffect(() => {
    carregarDetalhe();
  }, [carregarDetalhe]);

  // atualiza sozinho quando o gestor responde ou alguém solicita (sem refresh)
  useAoVivo(() => {
    carregarPainel();
    carregarDetalhe();
  });

  function escolher(id: string) {
    setSegId(id);
    try {
      localStorage.setItem(SEG_KEY, id);
    } catch {}
  }

  const r = detalhe?.resumo.id === segId ? detalhe.resumo : painel?.seguradoras.find((s) => s.id === segId);
  // ordem de chegada: o primeiro registro aparece primeiro (quem pede antes tem preferência)
  const movimentos = detalhe?.resumo.id === segId ? [...detalhe.movimentos].reverse() : [];
  const fila: Record<string, number> = {};
  movimentos.filter((m) => m.origem === "solicitacao").forEach((m, i) => (fila[m.id] = i + 1));
  const esp = detalhe?.resumo.id === segId ? (detalhe.especiais ?? []) : [];

  return (
    <>
      <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-1">Piaseg Franchising</p>
            <h1 className="font-heading text-2xl sm:text-3xl" style={{ color: "#c2a360" }}>
              Desconto Comercial
            </h1>
            <p className="text-white/80 text-sm mt-1">Conta corrente de descontos nas seguradoras</p>
          </div>
          <Link
            href={segId ? `/solicitar?seguradora=${segId}` : "/solicitar"}
            className="rounded-lg px-5 py-2.5 font-semibold text-sm"
            style={{ background: "#c2a360", color: "#072a3c" }}
          >
            + Solicitar reserva de verba
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">{erro}</p>
        )}
        {!painel && !erro && <p className="text-gray-500">Carregando saldos...</p>}

        {treino && (
          <div className="rounded-xl px-4 py-3 mb-6 text-sm" style={{ background: "#ede9fe", color: "#4c1d95", border: "1px solid #c4b5fd" }}>
            <strong>🎓 MODO TREINAMENTO — simulação.</strong> Os valores abaixo incluem os pedidos do{" "}
            <strong>{FRANQUEADO_TESTE}</strong>. Os saldos reais das seguradoras <strong>não são alterados</strong> e os
            franqueados não veem estes movimentos.{" "}
            <button onClick={alternarTreino} className="underline font-semibold cursor-pointer">
              Sair do treinamento
            </button>
          </div>
        )}

        {painel && (
          <>
            {painel.seguradoras.length === 0 ? (
              <p className="text-gray-500 bg-white rounded-xl p-6 shadow-sm">Nenhuma seguradora cadastrada ainda.</p>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
                {/* Coluna das seguradoras: lista lateral no computador, faixa rolável no celular */}
                <nav
                  aria-label="Seguradoras"
                  className="min-w-0 lg:sticky lg:top-4 bg-white rounded-xl shadow-sm p-2 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
                >
                  <p className="hidden lg:block text-xs uppercase tracking-wider text-gray-500 px-3 pt-2 pb-1">Seguradoras</p>
                  <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0">
                    {painel.seguradoras.map((s) => {
                      const ativa = s.id === segId;
                      return (
                        <li key={s.id} className="shrink-0 lg:shrink">
                          <button
                            onClick={() => escolher(s.id)}
                            aria-current={ativa ? "true" : undefined}
                            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left cursor-pointer transition"
                            style={
                              ativa
                                ? { background: "#072a3c", color: "#f6f6f6", boxShadow: "inset 4px 0 0 #c2a360" }
                                : { color: "#072a3c" }
                            }
                          >
                            <Logo nome={s.nome} url={s.logo_url} size={22} />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold whitespace-nowrap lg:whitespace-normal">{s.nome}</span>
                              <span className="block text-xs whitespace-nowrap" style={{ color: ativa ? "#d6bd8a" : "#6b7280" }}>
                                Disponível {formatBRL(s.saldo_a_utilizar)}
                              </span>
                              {s.especiais.length > 0 && (
                                <span
                                  className="inline-block text-[11px] font-bold rounded-full px-2 mt-1 whitespace-nowrap"
                                  style={{ background: ESPECIAL_COR.fundo, color: ESPECIAL_COR.cor }}
                                >
                                  ★ + desconto especial
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                {/* Quadros da seguradora escolhida, ao lado da lista */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    {r ? (
                      <div className="flex items-center gap-3">
                        <Logo nome={r.nome} url={r.logo_url} size={40} />
                        <h2 className="font-heading text-xl" style={{ color: "#072a3c" }}>
                          {r.nome} · {formatMes(mes)}
                        </h2>
                      </div>
                    ) : (
                      <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
                        Escolha a seguradora
                      </h2>
                    )}
                    <SeletorMes mes={mes} meses={painel.meses} onChange={setMes} />
                  </div>

                  {r && (
                    <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderTop: "4px solid #072a3c" }}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Saldo{esp.length > 0 && " · Automóvel"}</p>
                    <p className="text-2xl">
                      <Valor v={r.saldo} destaque />
                    </p>
                    <p className="text-xs mt-1 text-gray-500">verba do mês</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderTop: `4px solid ${SITUACAO.em_analise.cor}` }}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">− Reserva</p>
                    <p className="text-2xl">
                      <Valor v={r.reserva} destaque />
                    </p>
                    <p className="text-xs mt-1" style={{ color: SITUACAO.em_analise.cor }}>
                      ◷ aguardando aprovação do gestor
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderTop: `4px solid ${SITUACAO.aprovada.cor}` }}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">− Aprovado</p>
                    <p className="text-2xl">
                      <Valor v={r.aprovado} destaque />
                    </p>
                    <p className="text-xs mt-1" style={{ color: SITUACAO.aprovada.cor }}>
                      ✓ aprovado · aguardando transmissão
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderTop: `4px solid ${SITUACAO.aprovada_utilizada.cor}` }}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">− Transmitido</p>
                    <p className="text-2xl">
                      <Valor v={r.transmitido} destaque />
                    </p>
                    <p className="text-xs mt-1" style={{ color: SITUACAO.aprovada_utilizada.cor }}>
                      ✓ proposta transmitida
                    </p>
                  </div>
                  {/* "Disponível" = o que ainda pode ser solicitado; faixa em destaque no topo */}
                  <div
                    className="rounded-xl p-5 sm:col-span-2 lg:col-span-4 order-first flex flex-wrap items-center justify-between gap-4"
                    style={{ background: "#072a3c", border: "2px solid #c2a360", boxShadow: "0 6px 18px rgba(7,42,60,0.25)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider mb-1 font-semibold" style={{ color: "#c2a360" }}>
                        Disponível
                      </p>
                      <p
                        className="text-3xl sm:text-4xl font-bold tabular-nums whitespace-nowrap"
                        style={{ color: r.saldo_a_utilizar < 0 ? "#fca5a5" : "#ffffff" }}
                      >
                        {formatBRL(r.saldo_a_utilizar)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "#d6bd8a" }}>
                        para novas solicitações · Saldo − Reserva − Aprovado − Transmitido
                      </p>
                    </div>
                    <Link
                      href={`/solicitar?seguradora=${r.id}`}
                      className="text-sm font-bold rounded-lg px-4 py-2.5 whitespace-nowrap"
                      style={{ background: "#c2a360", color: "#072a3c" }}
                    >
                      Solicitar nesta seguradora →
                    </Link>
                  </div>
                </div>

                {esp.length > 0 && (
                  <section className="mb-6">
                    <h3 className="font-heading text-base mb-2" style={{ color: "#072a3c" }}>
                      ★ Descontos especiais
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Verba da seguradora para um produto específico, com saldo próprio (não se mistura com a verba de Automóvel).
                    </p>
                    <div className="flex flex-col gap-3">
                      {esp.map((e) => (
                        <div
                          key={e.categoria}
                          className="bg-white rounded-xl p-4 shadow-sm"
                          style={{ borderLeft: `4px solid ${ESPECIAL_COR.cor}` }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <p className="font-semibold" style={{ color: ESPECIAL_COR.cor }}>
                              {e.categoria}
                            </p>
                            <Link
                              href={`/solicitar?seguradora=${r.id}&verba=${encodeURIComponent(e.categoria)}`}
                              className="text-xs font-semibold underline"
                              style={{ color: "#072a3c" }}
                            >
                              Solicitar deste desconto →
                            </Link>
                          </div>
                          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                            {[
                              ["Saldo", e.saldo],
                              ["− Reserva", e.reserva],
                              ["− Aprovado", e.aprovado],
                              ["− Transmitido", e.transmitido],
                              ["= Disponível", e.saldo_a_utilizar],
                            ].map(([rot, v], i) => (
                              <div key={rot as string}>
                                <dt className="text-xs uppercase tracking-wider text-gray-500">{rot}</dt>
                                <dd className={i === 4 ? "text-lg" : ""}>
                                  <Valor v={v as number} destaque={i === 4} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
                      Movimentações
                    </h2>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {(["em_analise", "aprovada", "aprovada_utilizada", "reprovada", "expirada"] as const).map((k) => (
                        <span key={k} className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: SITUACAO[k].cor }} />
                          {SITUACAO[k].label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {movimentos.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4">Nenhuma movimentação em {formatMes(mes)}.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-gray-100">
                      {movimentos.map((m) => (
                        <LinhaMovimento
                          key={m.id}
                          m={m}
                          fila={fila[m.id]}
                          onMudou={() => {
                            carregarDetalhe();
                            carregarPainel();
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </section>
                    </>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-6 leading-relaxed">
              A verba é mensal: começa e termina dentro do mês. <strong>Saldo</strong>: verba da seguradora no mês.{" "}
              <strong>Reserva</strong>: solicitações aguardando o gestor.{" "}
              <strong>Aprovado</strong>: aprovado pelo gestor (passa da Reserva para cá). A partir da aprovação o franqueado
              tem <strong>48 horas</strong> para clicar em &quot;Proposta transmitida&quot;; se não clicar, o{" "}
              <strong>desconto expira</strong> e o valor volta para o saldo.{" "}
              <strong>Transmitido</strong>: depois que o franqueado clica em &quot;Proposta transmitida&quot;.{" "}
              <strong>Disponível</strong> = Saldo − Reserva − Aprovado − Transmitido: o que ainda está livre para novas
              solicitações. As solicitações aparecem por
              <strong> ordem de chegada</strong>: quem pede primeiro tem a preferência.
            </p>
          </>
        )}
        <MinhasSolicitacoes />

        <aside
          className="mt-10 rounded-xl p-5 sm:p-6"
          style={{ background: "#072a3c", borderLeft: "6px solid #c2a360" }}
          aria-label="Comunicado importante"
        >
          <p className="font-heading text-base sm:text-lg mb-3" style={{ color: "#c2a360" }}>
            ⚠ Comunicado Importante: Saldo de Descontos da Rede
          </p>
          <div className="text-sm leading-relaxed space-y-3" style={{ color: "#f6f6f6" }}>
            <p>
              Prezados, relembramos que o saldo de descontos com a seguradora é um <strong>recurso global para toda a rede</strong>.
              Diante disso, solicitamos o bom senso e a moderação de cada unidade na sua utilização, para que o benefício seja
              distribuído de forma justa.
            </p>
            <p>
              Ressaltamos também que a atualização do saldo ocorre <strong>estritamente após o envio do report por parte da
              seguradora</strong>, impossibilitando a previsão antecipada dos valores disponíveis.
            </p>
            <p className="font-semibold" style={{ color: "#d6bd8a" }}>
              Contamos com a colaboração de todos!
            </p>
          </div>
        </aside>
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">Piaseg Franchising</footer>
    </>
  );
}
