"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import { apiJson } from "../../lib/api";
import { isAdminLoggedIn } from "../../lib/auth";
import { formatDateTime } from "../../lib/types";

interface Backup {
  name: string;
  criado_em: string;
}

function origem(name: string): string {
  if (name.startsWith("deploy-")) return "Atualização do sistema";
  if (name.startsWith("auto-")) return "Automático (de hora em hora, quando há movimentação)";
  if (name.startsWith("antes-restore-")) return "Antes de uma restauração";
  return "";
}

export default function BackupsPage() {
  const router = useRouter();
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setBackups(await apiJson<Backup[]>("/admin/backups"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
      return;
    }
    carregar();
  }, [router, carregar]);

  async function restaurar(b: Backup) {
    const quando = formatDateTime(b.criado_em);
    if (
      !confirm(
        `Restaurar seguradoras e lançamentos para o estado de ${quando}?\n\nO estado atual é salvo automaticamente antes, então isso também pode ser desfeito.`,
      )
    )
      return;
    setRestaurando(b.name);
    setErro("");
    setAviso("");
    try {
      await apiJson(`/admin/backups/${b.name}/restore`, { method: "POST" });
      setAviso(`Dados restaurados para o estado de ${quando}.`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao restaurar");
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl mb-2" style={{ color: "#072a3c" }}>
          Backups
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Cópias automáticas de seguradoras e lançamentos: a cada atualização do sistema e de hora em hora quando há
          movimentação. Ficam guardadas as 60 mais recentes.
        </p>
        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {aviso && (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">✓ {aviso}</p>
        )}
        {!backups ? (
          <p className="text-gray-500">Carregando...</p>
        ) : backups.length === 0 ? (
          <p className="text-gray-500">Nenhum backup ainda.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {backups.map((b, i) => (
              <div key={b.name} className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">{formatDateTime(b.criado_em)}</p>
                  <p className="text-xs text-gray-500">
                    {origem(b.name)}
                    {i === 0 && " · mais recente"}
                  </p>
                </div>
                <button
                  onClick={() => restaurar(b)}
                  disabled={restaurando !== null}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-60"
                  style={{ color: "#072a3c", borderColor: "#e8e6df" }}
                >
                  {restaurando === b.name ? "Restaurando..." : "Restaurar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
