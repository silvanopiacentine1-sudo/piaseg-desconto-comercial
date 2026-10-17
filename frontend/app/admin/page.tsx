"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarLogo } from "../lib/logo";
import { useAoVivo } from "../lib/aoVivo";
import Header from "../components/Header";
import Logo from "../components/Logo";
import SeletorMes from "../components/SeletorMes";
import { useMesAdmin } from "../lib/mesAdmin";
import { apiJson, downloadFile } from "../lib/api";
import { isAdminLoggedIn } from "../lib/auth";
import { formatBRL, hojeISO, type Resumo } from "../lib/types";

export default function AdminPage() {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Resumo[] | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [mes, setMes, meses] = useMesAdmin();

  const carregar = useCallback(async () => {
    try {
      setLinhas(await apiJson<Resumo[]>(`/admin/seguradoras?mes=${mes}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [mes]);
  useAoVivo(carregar);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
      return;
    }
    carregar();
  }, [router, carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const nova = await apiJson<{ id: string }>("/admin/seguradoras", { method: "POST", body: JSON.stringify({ nome }) });
      setNome("");
      // logo é opcional: se escolheu o arquivo junto, já envia
      if (logo) await enviarLogo(nova.id, logo);
      setLogo(null);
      if (logoInput.current) logoInput.current.value = "";
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setSalvando(false);
    }
  }

  const ativas = (linhas ?? []).filter((l) => l.ativa);
  const total = (k: "saldo" | "reserva" | "liberado" | "saldo_a_utilizar") => ativas.reduce((acc, l) => acc + l[k], 0);

  return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="font-heading text-2xl" style={{ color: "#072a3c" }}>
            Seguradoras
          </h1>
          <SeletorMes mes={mes} meses={meses} onChange={setMes} todos />
          <button
            onClick={() => downloadFile("/admin/export", `desconto-comercial-${hojeISO()}.xlsx`).catch((e) => setErro(e.message))}
            className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer border"
            style={{ borderColor: "#072a3c", color: "#072a3c" }}
          >
            Exportar Excel
          </button>
        </div>

        <form onSubmit={criar} className="bg-white rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end mb-6">
          <div className="flex-1 min-w-56">
            <label className="block text-sm font-medium mb-1">Nova seguradora</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Nome da seguradora"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logomarca (opcional)</label>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:font-semibold file:cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg px-5 py-2 font-semibold text-white cursor-pointer disabled:opacity-60"
            style={{ background: "#072a3c" }}
          >
            + Cadastrar
          </button>
        </form>

        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {!linhas && !erro && <p className="text-gray-500">Carregando...</p>}

        {linhas && (
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ background: "#072a3c" }} className="text-white text-left">
                  <th className="px-4 py-3 font-semibold">Seguradora</th>
                  <th className="px-4 py-3 font-semibold text-right">Saldo</th>
                  <th className="px-4 py-3 font-semibold text-right">Reserva</th>
                  <th className="px-4 py-3 font-semibold text-right">Liberado</th>
                  <th className="px-4 py-3 font-semibold text-right" style={{ color: "#d6bd8a" }}>
                    Saldo à utilizar
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={`border-t border-gray-100 ${l.ativa ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/admin/seguradoras/${l.id}`} className="hover:underline inline-flex items-center gap-3">
                        <Logo nome={l.nome} url={l.logo_url} size={32} />
                        {l.nome}
                      </Link>
                      {!l.ativa && <span className="ml-2 text-xs text-gray-500">(inativa — fora do painel)</span>}
                      {(l.especiais ?? []).map((e) => (
                        <span key={e.categoria} className="block text-xs font-semibold mt-1" style={{ color: "#9a3412" }}>
                          ★ {e.categoria}: verba {formatBRL(e.saldo)} · à utilizar {formatBRL(e.saldo_a_utilizar)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(l.saldo)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{formatBRL(l.reserva)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{formatBRL(l.liberado)}</td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-bold"
                      style={{ color: l.saldo_a_utilizar < 0 ? "#b42318" : "#072a3c" }}
                    >
                      {formatBRL(l.saldo_a_utilizar)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/seguradoras/${l.id}`}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                        style={{ background: "#c2a360" }}
                      >
                        Movimentar
                      </Link>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Nenhuma seguradora cadastrada. Comece cadastrando acima.
                    </td>
                  </tr>
                )}
              </tbody>
              {ativas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 font-semibold" style={{ borderColor: "#c2a360" }}>
                    <td className="px-4 py-3">Total (ativas)</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(total("saldo"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(total("reserva"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatBRL(total("liberado"))}</td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#072a3c" }}>
                      {formatBRL(total("saldo_a_utilizar"))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </main>
    </>
  );
}
