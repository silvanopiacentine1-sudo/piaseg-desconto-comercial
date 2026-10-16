"use client";

import { useEffect, useMemo, useState } from "react";
import { API } from "./lib/api";
import { formatBRL, formatDateTime, type PainelPublico } from "./lib/types";

function Valor({ v, destaque = false }: { v: number; destaque?: boolean }) {
  const negativo = v < 0;
  return (
    <span
      className={`tabular-nums whitespace-nowrap ${destaque ? "font-bold" : ""}`}
      style={{ color: negativo ? "#b42318" : destaque ? "#072a3c" : undefined }}
    >
      {formatBRL(v)}
    </span>
  );
}

export default function PainelPage() {
  const [dados, setDados] = useState<PainelPublico | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const res = await fetch(`${API}/painel`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (ativo) {
          setDados(json);
          setErro("");
        }
      } catch {
        if (ativo) setErro("Não foi possível carregar os saldos. Tente atualizar a página em instantes.");
      }
    }
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, []);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.seguradoras ?? []).filter((s) => !q || s.nome.toLowerCase().includes(q));
  }, [dados, busca]);

  return (
    <>
      <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-1">Piaseg Franchising</p>
          <h1 className="font-heading text-2xl sm:text-3xl" style={{ color: "#c2a360" }}>
            Desconto Comercial
          </h1>
          <p className="text-white/80 text-sm mt-1">Conta corrente de descontos nas seguradoras</p>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">{erro}</p>
        )}

        {!dados && !erro && <p className="text-gray-500">Carregando saldos...</p>}

        {dados && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                { label: "Saldo total", v: dados.totais.saldo },
                { label: "Em reserva", v: dados.totais.reserva },
                { label: "Saldo à utilizar", v: dados.totais.saldo_a_utilizar, destaque: true },
              ].map((c) => (
                <div
                  key={c.label}
                  className="bg-white rounded-xl p-5 shadow-sm"
                  style={c.destaque ? { borderTop: "4px solid #c2a360" } : { borderTop: "4px solid #072a3c" }}
                >
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{c.label}</p>
                  <p className="text-2xl">
                    <Valor v={c.v} destaque />
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar seguradora..."
                className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 bg-white"
              />
              {dados.atualizado_em && (
                <p className="text-xs text-gray-500">Última movimentação: {formatDateTime(dados.atualizado_em)}</p>
              )}
            </div>

            {dados.seguradoras.length === 0 ? (
              <p className="text-gray-500 bg-white rounded-xl p-6 shadow-sm">Nenhuma seguradora cadastrada ainda.</p>
            ) : (
              <>
                {/* Tabela (telas médias e grandes) */}
                <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#072a3c" }} className="text-white text-left">
                        <th className="px-4 py-3 font-semibold">Seguradora</th>
                        <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                        <th className="px-4 py-3 font-semibold text-right">Reserva</th>
                        <th className="px-4 py-3 font-semibold text-right" style={{ color: "#d6bd8a" }}>
                          Saldo à utilizar
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((s) => (
                        <tr key={s.id} className="border-t border-gray-100 hover:bg-[#f6f6f6]">
                          <td className="px-4 py-3 font-medium">{s.nome}</td>
                          <td className="px-4 py-3 text-right">
                            <Valor v={s.saldo} />
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            <Valor v={s.reserva} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Valor v={s.saldo_a_utilizar} destaque />
                          </td>
                        </tr>
                      ))}
                      {linhas.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                            Nenhuma seguradora encontrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Cards (celular) */}
                <div className="sm:hidden flex flex-col gap-3">
                  {linhas.map((s) => (
                    <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm">
                      <p className="font-semibold mb-2" style={{ color: "#072a3c" }}>
                        {s.nome}
                      </p>
                      <dl className="grid grid-cols-2 gap-y-1 text-sm">
                        <dt className="text-gray-500">Saldo</dt>
                        <dd className="text-right">
                          <Valor v={s.saldo} />
                        </dd>
                        <dt className="text-gray-500">Reserva</dt>
                        <dd className="text-right">
                          <Valor v={s.reserva} />
                        </dd>
                        <dt className="text-gray-500 font-semibold">Saldo à utilizar</dt>
                        <dd className="text-right">
                          <Valor v={s.saldo_a_utilizar} destaque />
                        </dd>
                      </dl>
                    </div>
                  ))}
                  {linhas.length === 0 && <p className="text-center text-gray-500 py-4">Nenhuma seguradora encontrada.</p>}
                </div>
              </>
            )}

            <p className="text-xs text-gray-500 mt-6 leading-relaxed">
              <strong>Saldo</strong>: desconto disponível na conta da seguradora. <strong>Reserva</strong>: valores já
              comprometidos com negociações em andamento. <strong>Saldo à utilizar</strong>: o que ainda está livre para
              novas negociações (saldo − reserva). Para solicitar uso de desconto, fale com a equipe comercial Piaseg.
            </p>
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">Piaseg Franchising</footer>
    </>
  );
}
