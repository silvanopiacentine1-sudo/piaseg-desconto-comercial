"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Logo from "./components/Logo";
import SeletorMes from "./components/SeletorMes";
import { API } from "./lib/api";
import { getMinhas } from "./lib/minhas";
import {
  SITUACAO,
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

function Badge({ situacao }: { situacao: Movimento["situacao"] }) {
  const s = SITUACAO[situacao];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ color: s.cor, background: s.fundo }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: s.cor }} aria-hidden />
      {s.label}
    </span>
  );
}

function LinhaMovimento({ m }: { m: Movimento }) {
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
            {m.gestor_nome && ` · para ${m.gestor_nome}`}
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
          <p className="text-xs text-gray-500 whitespace-nowrap">
            Saldo: <span className="tabular-nums">{formatBRL(m.saldo_apos)}</span>
          </p>
        </div>
      </div>
      <div>
        <Badge situacao={m.situacao} />
      </div>
      {m.observacao && (
        <p className="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ background: "#f6f6f6" }}>
          <span className="block text-xs uppercase tracking-wider text-gray-500">Justificativa do franqueado</span>
          {m.observacao}
        </p>
      )}
      {m.origem === "solicitacao" && m.situacao !== "em_analise" && (m.resposta || m.respondido_por) && (
        <p className="text-sm rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ background: s.fundo }}>
          <span className="block text-xs uppercase tracking-wider" style={{ color: s.cor }}>
            Resposta de {m.respondido_por}
            {m.respondido_em && ` · ${formatDateTime(m.respondido_em)}`}
          </span>
          {m.resposta || "—"}
        </p>
      )}
    </li>
  );
}

function MinhasSolicitacoes() {
  const [itens, setItens] = useState<Solicitacao[]>([]);

  useEffect(() => {
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
              {SOLIC_STATUS[s.status].label}
            </span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">Aparecem aqui as solicitações feitas neste navegador.</p>
    </section>
  );
}

export default function PainelPage() {
  const [mes, setMes] = useState(mesAtual());
  const [painel, setPainel] = useState<PainelPublico | null>(null);
  const [segId, setSegId] = useState("");
  const [detalhe, setDetalhe] = useState<{ resumo: ResumoPublico; movimentos: Movimento[] } | null>(null);
  const [erro, setErro] = useState("");

  const carregarPainel = useCallback(async () => {
    try {
      const res = await fetch(`${API}/painel?mes=${mes}`, { cache: "no-store" });
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
  }, [mes]);

  const carregarDetalhe = useCallback(async () => {
    if (!segId) {
      setDetalhe(null);
      return;
    }
    try {
      const res = await fetch(`${API}/painel/${segId}?mes=${mes}`, { cache: "no-store" });
      if (res.ok) setDetalhe(await res.json());
    } catch {}
  }, [segId, mes]);

  useEffect(() => {
    carregarPainel();
    const t = setInterval(carregarPainel, 60_000);
    return () => clearInterval(t);
  }, [carregarPainel]);

  useEffect(() => {
    carregarDetalhe();
    const t = setInterval(carregarDetalhe, 60_000);
    return () => clearInterval(t);
  }, [carregarDetalhe]);

  function escolher(id: string) {
    setSegId(id);
    try {
      localStorage.setItem(SEG_KEY, id);
    } catch {}
  }

  const r = detalhe?.resumo.id === segId ? detalhe.resumo : painel?.seguradoras.find((s) => s.id === segId);
  const movimentos = detalhe?.resumo.id === segId ? detalhe.movimentos : [];

  return (
    <>
      <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-4">
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

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">{erro}</p>
        )}
        {!painel && !erro && <p className="text-gray-500">Carregando saldos...</p>}

        {painel && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
                Escolha a seguradora
              </h2>
              <SeletorMes mes={mes} meses={painel.meses} onChange={setMes} />
            </div>

            {painel.seguradoras.length === 0 ? (
              <p className="text-gray-500 bg-white rounded-xl p-6 shadow-sm">Nenhuma seguradora cadastrada ainda.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
                {painel.seguradoras.map((s) => {
                  const ativa = s.id === segId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => escolher(s.id)}
                      aria-pressed={ativa}
                      className="bg-white rounded-xl p-3 shadow-sm text-left flex flex-col gap-2 cursor-pointer transition"
                      style={{ outline: ativa ? "3px solid #c2a360" : "1px solid #e8e6df", outlineOffset: ativa ? 0 : -1 }}
                    >
                      <Logo nome={s.nome} url={s.logo_url} size={34} />
                      <span className="font-semibold text-sm" style={{ color: "#072a3c" }}>
                        {s.nome}
                      </span>
                      <span className="text-xs text-gray-500">
                        Disponível <Valor v={s.saldo_a_utilizar} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {r && (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <Logo nome={r.nome} url={r.logo_url} size={40} />
                  <h2 className="font-heading text-xl" style={{ color: "#072a3c" }}>
                    {r.nome} · {formatMes(mes)}
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderTop: "4px solid #072a3c" }}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Saldo</p>
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
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">− Liberado</p>
                    <p className="text-2xl">
                      <Valor v={r.liberado} destaque />
                    </p>
                    <p className="text-xs mt-1" style={{ color: SITUACAO.aprovada.cor }}>
                      ✓ aprovado pelo gestor
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderTop: "4px solid #c2a360" }}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">= Saldo à utilizar</p>
                    <p className="text-2xl">
                      <Valor v={r.saldo_a_utilizar} destaque />
                    </p>
                    <Link
                      href={`/solicitar?seguradora=${r.id}`}
                      className="inline-block text-xs font-semibold mt-2 underline"
                      style={{ color: "#072a3c" }}
                    >
                      Solicitar nesta seguradora →
                    </Link>
                  </div>
                </div>

                <section className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
                      Movimentações
                    </h2>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {(["aprovada", "reprovada", "em_analise"] as const).map((k) => (
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
                        <LinhaMovimento key={m.id} m={m} />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            <p className="text-xs text-gray-500 mt-6 leading-relaxed">
              A verba é mensal: começa e termina dentro do mês. <strong>Saldo</strong>: verba da seguradora no mês.{" "}
              <strong>Reserva</strong>: solicitações aguardando o gestor (se não aprovadas, o valor volta).{" "}
              <strong>Liberado</strong>: aprovado pelo gestor (passa da Reserva para cá). <strong>Saldo à utilizar</strong> =
              Saldo − Reserva − Liberado: o que ainda está livre.
            </p>
          </>
        )}
        <MinhasSolicitacoes />
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">Piaseg Franchising</footer>
    </>
  );
}
