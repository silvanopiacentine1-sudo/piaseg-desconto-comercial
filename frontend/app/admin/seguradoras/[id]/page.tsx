"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAoVivo } from "../../../lib/aoVivo";
import Header from "../../../components/Header";
import Logo from "../../../components/Logo";
import SeletorMes from "../../../components/SeletorMes";
import { useMesAdmin } from "../../../lib/mesAdmin";
import { apiJson } from "../../../lib/api";
import { enviarLogo } from "../../../lib/logo";
import { getOperador, isAdminLoggedIn } from "../../../lib/auth";
import {
  STATUS_LABEL,
  TIPO_LABEL,
  formatBRL,
  formatDate,
  formatDateTime,
  formatMes,
  hojeISO,
  parseValor,
  type Lancamento,
  type Resumo,
  type TipoLancamento,
} from "../../../lib/types";

const TIPO_INFO: Record<TipoLancamento, { cor: string; ajuda: string }> = {
  credito: { cor: "#1f7a4d", ajuda: "Entrada de desconto na conta da seguradora (aumenta o saldo)." },
  reserva: {
    cor: "#a4854a",
    ajuda: "Separa um valor para uma negociação em andamento. Depois você baixa (utilizou) ou cancela (libera).",
  },
  utilizacao: { cor: "#b42318", ajuda: "Desconto já usado, direto, sem reserva prévia (diminui o saldo)." },
};

function Card({ label, v, destaque }: { label: string; v: number; destaque?: boolean }) {
  return (
    <div
      className="bg-white rounded-xl p-4 shadow-sm"
      style={{ borderTop: `4px solid ${destaque ? "#c2a360" : "#072a3c"}` }}
    >
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: v < 0 ? "#b42318" : "#072a3c" }}>
        {formatBRL(v)}
      </p>
    </div>
  );
}

export default function SeguradoraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const [tipo, setTipo] = useState<TipoLancamento>("credito");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [franqueado, setFranqueado] = useState("");
  const [descricao, setDescricao] = useState("");
  // quem está lançando (fica gravado com data e hora); vem preenchido com o operador logado
  const [lancadoPor, setLancadoPor] = useState("");
  const [gestores, setGestores] = useState<string[]>([]);

  useEffect(() => {
    setLancadoPor(getOperador());
    apiJson<{ nome: string; ativo?: boolean }[]>("/admin/gestores")
      .then((l) => setGestores(l.filter((g) => g.ativo !== false).map((g) => g.nome)))
      .catch(() => {});
  }, []);
  const [salvando, setSalvando] = useState(false);

  const [editNome, setEditNome] = useState("");
  const [editando, setEditando] = useState(false);
  const [mostrarEstornados, setMostrarEstornados] = useState(true);

  const [mes, setMes, meses] = useMesAdmin();

  const carregar = useCallback(async () => {
    try {
      const r = await apiJson<{ resumo: Resumo; lancamentos: Lancamento[] }>(`/admin/seguradoras/${id}?mes=${mes}`);
      setResumo(r.resumo);
      setLancs(r.lancamentos);
      setEditNome((atual) => atual || r.resumo.nome); // não apaga o que está sendo digitado
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [id, mes]);
  useAoVivo(carregar);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
      return;
    }
    carregar();
  }, [router, carregar]);

  function operadorOuPergunta(): string | null {
    let op = getOperador();
    if (!op) {
      op = window.prompt("Informe seu nome (fica registrado no lançamento):")?.trim() ?? "";
      if (op) localStorage.setItem("desconto_operador", op);
    }
    return op || null;
  }

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    const v = parseValor(valor);
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe um valor válido maior que zero (ex.: 1.500,00).");
      return;
    }
    if (tipo !== "credito" && resumo && v > resumo.saldo_a_utilizar) {
      const ok = window.confirm(
        `Atenção: ${formatBRL(v)} é maior que o saldo à utilizar (${formatBRL(resumo.saldo_a_utilizar)}). ` +
          "O saldo vai ficar negativo. Deseja lançar mesmo assim?",
      );
      if (!ok) return;
    }
    const operador = lancadoPor.trim();
    if (!operador) {
      setErro("Informe seu nome no campo \"Lançado por\".");
      return;
    }
    setSalvando(true);
    try {
      await apiJson(`/admin/seguradoras/${id}/lancamentos`, {
        method: "POST",
        body: JSON.stringify({ tipo, valor: v, data, franqueado, descricao, operador }),
      });
      setValor("");
      setFranqueado("");
      setDescricao("");
      setAviso(
        `${TIPO_LABEL[tipo]} de ${formatBRL(v)} lançado por ${operador} em ${formatDateTime(new Date().toISOString())}. ` +
          "O painel dos franqueados já foi atualizado.",
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao lançar");
    } finally {
      setSalvando(false);
    }
  }

  async function acao(l: Lancamento, acao: "utilizar" | "cancelar" | "estornar") {
    setErro("");
    setAviso("");
    const textos = {
      utilizar: `Baixar a reserva de ${formatBRL(l.valor)} como UTILIZADA? O valor sai do saldo.`,
      cancelar: `Cancelar a reserva de ${formatBRL(l.valor)}? O valor volta a ficar disponível.`,
      estornar: `Estornar este lançamento de ${formatBRL(l.valor)}? Ele deixa de contar no saldo (continua no extrato como estornado).`,
    };
    let motivo = "";
    if (acao === "estornar") {
      motivo = window.prompt(`${textos.estornar}\n\nInforme o motivo do estorno:`)?.trim() ?? "";
      if (!motivo) return;
    } else {
      const r = window.prompt(`${textos[acao]}\n\nObservação (opcional):`, "");
      if (r === null) return;
      motivo = r;
    }
    const operador = operadorOuPergunta();
    if (!operador) return;
    try {
      await apiJson(`/admin/lancamentos/${l.id}/${acao}`, { method: "POST", body: JSON.stringify({ operador, motivo }) });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function salvarSeguradora(ativa: boolean) {
    setErro("");
    try {
      await apiJson(`/admin/seguradoras/${id}`, { method: "PUT", body: JSON.stringify({ nome: editNome, ativa }) });
      setEditando(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function excluir() {
    if (!window.confirm("Excluir esta seguradora? (só é possível se ela não tiver nenhum lançamento)")) return;
    try {
      await apiJson(`/admin/seguradoras/${id}`, { method: "DELETE" });
      router.push("/admin");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  const reservasAbertas = lancs.filter((l) => l.tipo === "reserva" && l.status === "aberta" && !l.estornado);
  const extrato = mostrarEstornados ? lancs : lancs.filter((l) => !l.estornado);

  return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <Link href="/admin" className="text-sm text-gray-500 hover:underline">
          ← Voltar para seguradoras
        </Link>

        {resumo && (
          <>
            <div className="flex flex-wrap items-center gap-3 mt-2 mb-6">
              {editando ? (
                <>
                  <input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-lg"
                  />
                  <button
                    onClick={() => salvarSeguradora(resumo.ativa)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white cursor-pointer"
                    style={{ background: "#072a3c" }}
                  >
                    Salvar
                  </button>
                  <button onClick={() => setEditando(false)} className="text-sm text-gray-500 cursor-pointer">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <Logo nome={resumo.nome} url={resumo.logo_url} size={44} />
                  <h1 className="font-heading text-2xl" style={{ color: "#072a3c" }}>
                    {resumo.nome}
                  </h1>
                  <label className="text-sm text-gray-500 hover:underline cursor-pointer">
                    {resumo.logo_url ? "Trocar logo" : "Enviar logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        setErro("");
                        try {
                          await enviarLogo(id, f);
                          await carregar();
                        } catch (err) {
                          setErro(err instanceof Error ? err.message : "Erro ao enviar logo");
                        }
                      }}
                    />
                  </label>
                  {resumo.logo_url && (
                    <button
                      onClick={async () => {
                        if (!window.confirm("Remover a logo desta seguradora?")) return;
                        await apiJson(`/admin/seguradoras/${id}/logo`, { method: "DELETE" }).catch(() => {});
                        await carregar();
                      }}
                      className="text-sm text-gray-500 hover:underline cursor-pointer"
                    >
                      Remover logo
                    </button>
                  )}
                  {!resumo.ativa && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-gray-200 text-gray-600">Inativa — fora do painel</span>
                  )}
                  <button onClick={() => setEditando(true)} className="text-sm text-gray-500 hover:underline cursor-pointer">
                    Renomear
                  </button>
                  <button
                    onClick={() => salvarSeguradora(!resumo.ativa)}
                    className="text-sm text-gray-500 hover:underline cursor-pointer"
                  >
                    {resumo.ativa ? "Desativar (tirar do painel)" : "Reativar"}
                  </button>
                  {lancs.length === 0 && (
                    <button onClick={excluir} className="text-sm text-red-600 hover:underline cursor-pointer">
                      Excluir
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <p className="text-sm text-gray-500">
                Valores de <strong>{formatMes(mes)}</strong>
                {resumo.em_analise > 0 && ` · ${formatBRL(resumo.em_analise)} da reserva são solicitações em análise`}
              </p>
              <SeletorMes mes={mes} meses={meses} onChange={setMes} todos />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card label="Saldo (verba do mês)" v={resumo.saldo} />
              <Card label="− Reserva" v={resumo.reserva} />
              <Card label="− Liberado" v={resumo.liberado} />
              <Card label="= Saldo à utilizar" v={resumo.saldo_a_utilizar} destaque />
            </div>
          </>
        )}

        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {aviso && (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">{aviso}</p>
        )}

        {resumo && (
          <div className="grid lg:grid-cols-[minmax(0,380px)_1fr] gap-6 items-start">
            {/* Novo lançamento */}
            <form onSubmit={lancar} className="bg-white rounded-xl p-5 shadow-sm flex flex-col gap-3">
              <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
                Novo lançamento
              </h2>
              <div className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "#f6f6f6" }}>
                {(["credito", "reserva", "utilizacao"] as TipoLancamento[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="rounded-md py-2 text-sm font-semibold cursor-pointer"
                    style={
                      tipo === t ? { background: TIPO_INFO[t].cor, color: "white" } : { color: "#555", background: "transparent" }
                    }
                  >
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">{TIPO_INFO[tipo].ajuda}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                  <input
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data</label>
                  <input
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  />
                </div>
              </div>
              {tipo !== "credito" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Franqueado</label>
                  <input
                    value={franqueado}
                    onChange={(e) => setFranqueado(e.target.value)}
                    placeholder="Unidade que vai usar o desconto"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Lançado por (seu nome) *
                </label>
                <input
                  value={lancadoPor}
                  onChange={(e) => setLancadoPor(e.target.value)}
                  list="lista-gestores"
                  placeholder="Nome de quem está lançando"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
                <datalist id="lista-gestores">
                  {gestores.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
                <p className="text-xs text-gray-400 mt-1">Fica registrado com a data e a hora exatas do lançamento.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição</label>
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder={tipo === "credito" ? "Ex.: crédito campanha outubro" : "Ex.: cliente / apólice / proposta"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg py-2.5 font-semibold text-white cursor-pointer disabled:opacity-60"
                style={{ background: TIPO_INFO[tipo].cor }}
              >
                {salvando ? "Lançando..." : `Lançar ${TIPO_LABEL[tipo].toLowerCase()}`}
              </button>
            </form>

            <div className="flex flex-col gap-6 min-w-0">
              {/* Reservas em aberto */}
              <section className="bg-white rounded-xl p-5 shadow-sm">
                <h2 className="font-heading text-lg mb-3" style={{ color: "#072a3c" }}>
                  Aguardando baixa ({reservasAbertas.length})
                </h2>
                {reservasAbertas.length === 0 ? (
                  <p className="text-sm text-gray-500">Nada aguardando baixa.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-gray-100">
                    {reservasAbertas.map((l) => (
                      <li key={l.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold tabular-nums">
                            {formatBRL(l.valor)}
                            <span
                              className="ml-2 text-xs rounded-full px-2 py-0.5 font-semibold"
                              style={
                                l.solicitacao_id
                                  ? { color: "#1f7a4d", background: "#e8f3ec" }
                                  : { color: "#8a6a1f", background: "#fbf3e0" }
                              }
                            >
                              {l.solicitacao_id ? "✓ Liberado (aprovado pelo gestor)" : "Reserva manual"}
                            </span>
                          </p>
                          <p className="text-sm text-gray-600 truncate">
                            {l.franqueado || "Sem franqueado"}
                            {l.descricao && ` · ${l.descricao}`}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatDate(l.data)} · por {l.operador}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => acao(l, "utilizar")}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                            style={{ background: "#072a3c" }}
                          >
                            Baixar (utilizada)
                          </button>
                          <button
                            onClick={() => acao(l, "cancelar")}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer"
                            style={{ borderColor: "#c2a360", color: "#a4854a" }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Extrato */}
              <section className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="font-heading text-lg" style={{ color: "#072a3c" }}>
                    Extrato
                  </h2>
                  <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mostrarEstornados}
                      onChange={(e) => setMostrarEstornados(e.target.checked)}
                    />
                    Mostrar estornados
                  </label>
                </div>
                {extrato.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum lançamento ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-3 font-medium">Data</th>
                          <th className="py-2 pr-3 font-medium">Tipo</th>
                          <th className="py-2 pr-3 font-medium text-right">Valor</th>
                          <th className="py-2 pr-3 font-medium">Detalhes</th>
                          <th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {extrato.map((l) => {
                          // reserva cancelada não mexe no saldo; em aberto só compromete
                          const sinal =
                            l.tipo === "credito" ? "+" : l.tipo === "reserva" && l.status !== "utilizada" ? "" : "−";
                          return (
                            <tr key={l.id} className={`border-b border-gray-50 align-top ${l.estornado ? "opacity-50" : ""}`}>
                              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(l.data)}</td>
                              <td className="py-2 pr-3 whitespace-nowrap">
                                <span className="font-semibold" style={{ color: TIPO_INFO[l.tipo].cor }}>
                                  {TIPO_LABEL[l.tipo]}
                                </span>
                                {l.tipo === "reserva" && l.status && !l.estornado && (
                                  <span className="block text-xs text-gray-500">{STATUS_LABEL[l.status]}</span>
                                )}
                                {l.estornado && <span className="block text-xs text-red-600">Estornado</span>}
                                {l.teste && <span className="block text-xs font-bold" style={{ color: "#5b21b6" }}>🎓 Treinamento (não conta)</span>}
                              </td>
                              <td
                                className={`py-2 pr-3 text-right tabular-nums whitespace-nowrap ${l.estornado ? "line-through" : ""}`}
                              >
                                {sinal} {formatBRL(l.valor)}
                              </td>
                              <td className="py-2 pr-3 text-gray-600">
                                {[l.franqueado, l.descricao].filter(Boolean).join(" · ") || "—"}
                                <span className="block text-xs text-gray-400">
                                  Lançado por <strong className="font-semibold text-gray-600">{l.operador}</strong> em{" "}
                                  {formatDateTime(l.created_at)}
                                  {l.status_por &&
                                    ` · ${STATUS_LABEL[l.status!]} por ${l.status_por}${l.status_motivo ? `: ${l.status_motivo}` : ""}`}
                                  {l.estornado && ` · Estornado por ${l.estornado_por}: ${l.estorno_motivo}`}
                                </span>
                              </td>
                              <td className="py-2 text-right">
                                {!l.estornado && (
                                  <button
                                    onClick={() => acao(l, "estornar")}
                                    className="text-xs text-red-600 hover:underline cursor-pointer"
                                  >
                                    Estornar
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
