"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { apiJson, downloadFile } from "../../lib/api";
import { useAoVivo } from "../../lib/aoVivo";
import { formatBRL } from "../../lib/types";

interface LinhaSeg {
  id: string;
  nome: string;
  logo_url: string | null;
  geral: number[];
  especial: number[];
  total: number[];
  total_ano: number;
  geral_ano: number;
  especial_ano: number;
  especiais: { categoria: string; valor: number }[];
}

interface Verba {
  ano: number;
  anos: number[];
  meses: string[];
  seguradoras: LinhaSeg[];
  totais_mes: { geral: number[]; especial: number[]; total: number[] };
  total_ano: number;
  geral_ano: number;
  especial_ano: number;
  media_mensal: number;
  especiais_ano: { categoria: string; valor: number }[];
}

// cores do gráfico validadas (paleta categórica: azul = geral, laranja = especial)
const COR_GERAL = "#2a78d6";
const COR_ESPECIAL = "#eb6834";

// células mensais da tabela sem "R$" (o cabeçalho avisa), para caber o ano inteiro
const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const curto = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : v >= 1000
      ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
      : formatBRL(v);

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

/** Barras empilhadas por mês: verba geral + desconto especial. */
function GraficoMeses({ v }: { v: Verba }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...v.totais_mes.total, 1);
  const altura = 200;
  const iMax = v.totais_mes.total.indexOf(Math.max(...v.totais_mes.total));
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-heading text-base" style={{ color: "#072a3c" }}>
          Verba recebida por mês · {v.ano}
        </h3>
        <div className="flex gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: COR_GERAL }} /> Automóvel
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: COR_ESPECIAL }} /> Desconto especial
          </span>
        </div>
      </div>
      <div className="relative">
        <div className="grid grid-cols-12 gap-1.5 sm:gap-3 items-end" style={{ height: altura + 24 }}>
          {v.meses.map((nome, i) => {
            const g = v.totais_mes.geral[i];
            const e = v.totais_mes.especial[i];
            const t = g + e;
            const hG = (g / max) * altura;
            const hE = (e / max) * altura;
            return (
              <div
                key={nome}
                className="relative flex flex-col items-center justify-end h-full cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ background: hover === i ? "#f6f6f6" : undefined, borderRadius: 6 }}
              >
                {i === iMax && t > 0 && (
                  <span className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1 whitespace-nowrap">{curto(t)}</span>
                )}
                <div className="w-full flex flex-col items-center justify-end border-b border-gray-300" style={{ height: altura }}>
                  <div className="w-full max-w-10 flex flex-col justify-end">
                  {e > 0 && (
                    <div
                      style={{
                        height: hE,
                        background: COR_ESPECIAL,
                        borderRadius: "4px 4px 0 0",
                        marginBottom: g > 0 ? 2 : 0,
                      }}
                    />
                  )}
                  {g > 0 && (
                    <div style={{ height: hG, background: COR_GERAL, borderRadius: e > 0 ? 0 : "4px 4px 0 0" }} />
                  )}
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs text-gray-500 mt-1">{nome}</span>
              </div>
            );
          })}
        </div>
        {hover !== null && (
          <div
            className="absolute z-10 bg-white rounded-lg shadow-lg px-3 py-2 text-xs pointer-events-none"
            style={{
              top: 0,
              left: `${Math.min(Math.max((hover / 12) * 100, 2), 70)}%`,
              border: "1px solid #e8e6df",
            }}
          >
            <p className="font-semibold mb-1" style={{ color: "#072a3c" }}>
              {v.meses[hover]}/{v.ano}
            </p>
            <p className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: COR_GERAL }} />
              Automóvel: <strong className="tabular-nums">{formatBRL(v.totais_mes.geral[hover])}</strong>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: COR_ESPECIAL }} />
              Especial: <strong className="tabular-nums">{formatBRL(v.totais_mes.especial[hover])}</strong>
            </p>
            <p className="mt-1 pt-1 border-t border-gray-100">
              Total: <strong className="tabular-nums">{formatBRL(v.totais_mes.total[hover])}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerbaRecebida() {
  const [ano, setAno] = useState<number | null>(null);
  const [v, setV] = useState<Verba | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setV(await apiJson<Verba>(`/admin/relatorio/verba${ano ? `?ano=${ano}` : ""}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [ano]);
  useAoVivo(carregar);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <p className="text-sm text-gray-500 mb-5">
        Quanto recebemos de verba de desconto das seguradoras (créditos lançados), mês a mês e no total do ano. Créditos
        estornados não contam.
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Ano</span>
          <select
            value={v?.ano ?? ""}
            onChange={(e) => setAno(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 bg-white font-semibold"
            style={{ color: "#072a3c" }}
          >
            {(v?.anos ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {v && (
          <button
            onClick={() => downloadFile(`/admin/relatorio/verba/export?ano=${v.ano}`, `verba-recebida-${v.ano}.xlsx`).catch((e) => setErro(e.message))}
            className="ml-auto rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer border"
            style={{ borderColor: "#072a3c", color: "#072a3c" }}
          >
            Exportar Excel
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
      {!v && !erro && <p className="text-gray-500">Carregando...</p>}

      {v && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Kpi label={`Total recebido em ${v.ano}`} valor={formatBRL(v.total_ano)} />
            <Kpi label="Automóvel" valor={formatBRL(v.geral_ano)} />
            <Kpi
              label="Descontos especiais"
              valor={formatBRL(v.especial_ano)}
              sub={v.especiais_ano.map((e) => `${e.categoria}: ${curto(e.valor)}`).join(" · ") || undefined}
            />
            <Kpi label="Média por mês" valor={formatBRL(v.media_mensal)} sub="considerando os meses com verba" />
          </div>

          {v.total_ano === 0 ? (
            <p className="text-gray-500 bg-white rounded-xl p-6 shadow-sm">Nenhum crédito lançado em {v.ano}.</p>
          ) : (
            <>
              <GraficoMeses v={v} />

              <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full text-xs sm:text-sm min-w-[1050px]">
                  <thead>
                    <tr style={{ background: "#072a3c" }} className="text-white text-left">
                      <th className="px-3 py-3 font-semibold sticky left-0" style={{ background: "#072a3c" }}>
                        Seguradora <span className="font-normal text-white/60">(em R$)</span>
                      </th>
                      {v.meses.map((m) => (
                        <th key={m} className="px-2 py-3 font-semibold text-right">
                          {m}
                        </th>
                      ))}
                      <th className="px-3 py-3 font-semibold text-right" style={{ color: "#d6bd8a" }}>
                        Total {v.ano}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.seguradoras.map((s) => (
                      <Fragment key={s.id}>
                        <tr
                          className="border-t border-gray-100 hover:bg-[#f6f6f6] cursor-pointer"
                          onClick={() => setAberto(aberto === s.id ? null : s.id)}
                        >
                          <td className="px-3 py-2.5 font-medium sticky left-0 bg-white">
                            <span className="flex items-center gap-2">
                              <span className="text-gray-400">{aberto === s.id ? "▾" : "▸"}</span>
                              <Logo nome={s.nome} url={s.logo_url} size={20} />
                              {s.nome}
                            </span>
                          </td>
                          {s.total.map((x, i) => (
                            <td key={i} className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                              {x ? num(x) : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: "#072a3c" }}>
                            {formatBRL(s.total_ano)}
                          </td>
                        </tr>
                        {aberto === s.id && (
                          <>
                            <tr className="bg-[#f6f6f6] text-xs">
                              <td className="px-3 py-2 pl-10 sticky left-0 bg-[#f6f6f6] whitespace-nowrap">
                                <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: COR_GERAL }} />
                                Automóvel
                              </td>
                              {s.geral.map((x, i) => (
                                <td key={i} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                                  {x ? num(x) : ""}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatBRL(s.geral_ano)}</td>
                            </tr>
                            <tr className="bg-[#f6f6f6] text-xs">
                              <td className="px-3 py-2 pl-10 sticky left-0 bg-[#f6f6f6] whitespace-nowrap">
                                <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: COR_ESPECIAL }} />
                                Especial{s.especiais.length > 0 && ` (${s.especiais.map((e) => e.categoria).join(", ")})`}
                              </td>
                              {s.especial.map((x, i) => (
                                <td key={i} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                                  {x ? num(x) : ""}
                                </td>
                              ))}
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatBRL(s.especial_ano)}</td>
                            </tr>
                          </>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold" style={{ borderColor: "#c2a360" }}>
                      <td className="px-3 py-3 sticky left-0 bg-white">Total</td>
                      {v.totais_mes.total.map((x, i) => (
                        <td key={i} className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
                          {x ? num(x) : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: "#072a3c" }}>
                        {formatBRL(v.total_ano)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Clique numa seguradora para ver a divisão entre Automóvel e desconto especial.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
