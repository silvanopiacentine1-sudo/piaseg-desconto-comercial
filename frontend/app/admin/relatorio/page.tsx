"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAoVivo } from "../../lib/aoVivo";
import Header from "../../components/Header";
import VerbaRecebida from "./VerbaRecebida";
import SeletorMes from "../../components/SeletorMes";
import { apiJson, downloadFile } from "../../lib/api";
import { isAdminLoggedIn } from "../../lib/auth";
import { useMesAdmin } from "../../lib/mesAdmin";
import { formatBRL, formatMes, type Resumo } from "../../lib/types";

interface LinhaRel {
  franqueado: string;
  utilizado: number;
  reservado: number;
  total: number;
  percentual: number | null;
  negocios: number;
  solic_aprovadas: number;
  solic_reprovadas: number;
  solic_pendentes: number;
  por_seguradora: { seguradora: string; valor: number }[];
}

interface Relatorio {
  mes: string;
  verba_total: number;
  usado_total: number;
  percentual_usado: number | null;
  saldo_restante: number;
  negocios_total: number;
  franqueados: LinhaRel[];
}

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

function Medidor({ valor, titulo }: { valor: number | null; titulo: string }) {
  const largura = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <div className="flex items-center gap-2 min-w-40" title={titulo}>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#e8e6df" }}>
        <div className="h-full" style={{ width: `${largura}%`, background: "#072a3c", borderRadius: 4 }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-14 text-right">{pct(valor)}</span>
    </div>
  );
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm" style={{ borderTop: "4px solid #072a3c" }}>
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: "#072a3c" }}>
        {valor}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function UsoFranqueados() {
  const router = useRouter();
  const [mes, setMes, meses] = useMesAdmin();
  const [segId, setSegId] = useState("");
  const [seguradoras, setSeguradoras] = useState<Resumo[]>([]);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const query = `mes=${mes}${segId ? `&seguradora_id=${segId}` : ""}`;

  const carregar = useCallback(async () => {
    try {
      setRel(await apiJson<Relatorio>(`/admin/relatorio?${query}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [query]);
  useAoVivo(carregar);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
      return;
    }
    apiJson<Resumo[]>("/admin/seguradoras").then(setSeguradoras).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (isAdminLoggedIn()) carregar();
  }, [carregar]);

  const nomeSeg = seguradoras.find((s) => s.id === segId)?.nome ?? "todas as seguradoras";

  return (
    <>
      <div>
        <p className="text-sm text-gray-500 mb-5">
          Quanto cada franqueado usou da verba de {nomeSeg} em {formatMes(mes)}. &quot;Usado&quot; = utilizado + reservado
          (aprovado aguardando uso). Solicitações em análise ou não aprovadas não contam como uso.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <SeletorMes mes={mes} meses={meses} onChange={setMes} />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Seguradora</span>
            <select
              value={segId}
              onChange={(e) => setSegId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">Todas</option>
              {seguradoras.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              downloadFile(`/admin/relatorio/export?${query}`, `relatorio-desconto-${mes}.xlsx`).catch((e) => setErro(e.message))
            }
            className="ml-auto rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer border"
            style={{ borderColor: "#072a3c", color: "#072a3c" }}
          >
            Exportar Excel
          </button>
        </div>

        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {!rel && !erro && <p className="text-gray-500">Carregando...</p>}

        {rel && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              <Kpi label="Verba do mês" valor={formatBRL(rel.verba_total)} />
              <Kpi label="Usado" valor={formatBRL(rel.usado_total)} />
              <Kpi label="% da verba usada" valor={pct(rel.percentual_usado)} />
              <Kpi label="Saldo restante" valor={formatBRL(rel.saldo_restante)} />
              <Kpi label="Negócios" valor={String(rel.negocios_total)} sub={`${rel.franqueados.length} franqueado(s)`} />
            </div>

            {rel.verba_total === 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                Não há crédito de verba lançado neste filtro, por isso o percentual aparece como &quot;—&quot;.
              </p>
            )}

            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr style={{ background: "#072a3c" }} className="text-white text-left">
                    <th className="px-4 py-3 font-semibold">Franqueado</th>
                    <th className="px-4 py-3 font-semibold text-right">Utilizado</th>
                    <th className="px-4 py-3 font-semibold text-right">Reservado</th>
                    <th className="px-4 py-3 font-semibold text-right">Total usado</th>
                    <th className="px-4 py-3 font-semibold" style={{ color: "#d6bd8a" }}>
                      % da verba total
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">Negócios</th>
                    <th className="px-4 py-3 font-semibold">Solicitações</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.franqueados.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                        Nenhum uso de desconto neste período.
                      </td>
                    </tr>
                  )}
                  {rel.franqueados.map((f) => (
                    <Fragment key={f.franqueado}>
                      <tr
                        className="border-t border-gray-100 hover:bg-[#f6f6f6] cursor-pointer align-middle"
                        onClick={() => setAberto(aberto === f.franqueado ? null : f.franqueado)}
                      >
                        <td className="px-4 py-3 font-medium">
                          <span className="text-gray-400 mr-1">{aberto === f.franqueado ? "▾" : "▸"}</span>
                          {f.franqueado}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatBRL(f.utilizado)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">{formatBRL(f.reservado)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: "#072a3c" }}>
                          {formatBRL(f.total)}
                        </td>
                        <td className="px-4 py-3">
                          <Medidor
                            valor={f.percentual}
                            titulo={`${f.franqueado}: ${pct(f.percentual)} da verba (${formatBRL(f.total)} de ${formatBRL(rel.verba_total)}) em ${f.negocios} negócio(s)`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{f.negocios}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span style={{ color: "#1f7a4d" }}>✓ {f.solic_aprovadas} aprov.</span>
                          <span className="mx-1.5 text-gray-300">|</span>
                          <span style={{ color: "#b42318" }}>✕ {f.solic_reprovadas} não aprov.</span>
                          {f.solic_pendentes > 0 && (
                            <>
                              <span className="mx-1.5 text-gray-300">|</span>
                              <span style={{ color: "#8a6a1f" }}>◷ {f.solic_pendentes} em análise</span>
                            </>
                          )}
                        </td>
                      </tr>
                      {aberto === f.franqueado && (
                        <tr className="bg-[#f6f6f6]">
                          <td colSpan={7} className="px-10 py-3">
                            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Por seguradora</p>
                            {f.por_seguradora.length === 0 ? (
                              <p className="text-sm text-gray-500">Sem uso, só solicitações.</p>
                            ) : (
                              <ul className="text-sm flex flex-wrap gap-x-6 gap-y-1">
                                {f.por_seguradora.map((p) => (
                                  <li key={p.seguradora}>
                                    {p.seguradora}: <strong className="tabular-nums">{formatBRL(p.valor)}</strong>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                {rel.franqueados.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 font-semibold" style={{ borderColor: "#c2a360" }}>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatBRL(rel.franqueados.reduce((a, f) => a + f.utilizado, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatBRL(rel.franqueados.reduce((a, f) => a + f.reservado, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatBRL(rel.usado_total)}</td>
                      <td className="px-4 py-3">{pct(rel.percentual_usado)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{rel.negocios_total}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Clique num franqueado para ver o uso por seguradora. Negócios = utilizações e reservas aprovadas (canceladas e
              estornadas não contam).
            </p>
          </>
        )}
      </div>
    </>
  );
}

const ABAS = [
  { v: "uso", label: "Uso por franqueado" },
  { v: "verba", label: "Verba recebida das seguradoras" },
] as const;

export default function RelatorioPage() {
  const [aba, setAba] = useState<(typeof ABAS)[number]["v"]>("uso");

  useEffect(() => {
    try {
      const salva = sessionStorage.getItem("desconto_relatorio_aba");
      if (salva === "uso" || salva === "verba") setAba(salva);
    } catch {}
  }, []);

  function trocar(v: (typeof ABAS)[number]["v"]) {
    setAba(v);
    try {
      sessionStorage.setItem("desconto_relatorio_aba", v);
    } catch {}
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl mb-4" style={{ color: "#072a3c" }}>
          Relatórios
        </h1>
        <div className="flex flex-wrap gap-1 rounded-lg p-1 bg-white shadow-sm mb-5 w-fit">
          {ABAS.map((a) => (
            <button
              key={a.v}
              onClick={() => trocar(a.v)}
              className="rounded-md px-4 py-2 text-sm font-semibold cursor-pointer"
              style={aba === a.v ? { background: "#072a3c", color: "white" } : { color: "#555" }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {aba === "uso" ? <UsoFranqueados /> : <VerbaRecebida />}
      </main>
    </>
  );
}
