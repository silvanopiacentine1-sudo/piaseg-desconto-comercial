"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../../lib/api";
import { isAdminLoggedIn, setAdminPassword } from "../../lib/auth";
import Header from "../../components/Header";

export default function SenhaPage() {
  const router = useRouter();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
    }
  }, [router]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAviso("");

    if (novaSenha.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    try {
      await apiJson("/admin/senha", { method: "PUT", body: JSON.stringify({ senha_nova: novaSenha }) });
      setAdminPassword(novaSenha);
      setNovaSenha("");
      setConfirmar("");
      setAviso("Senha alterada com sucesso. Use a nova senha no próximo login.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao trocar a senha");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl mb-2" style={{ color: "#072a3c" }}>
          Trocar Senha do Painel
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Essa senha é única e compartilhada por quem acessa o painel administrativo — não existe login individual.
        </p>

        <form onSubmit={salvar} className="bg-white rounded-xl p-6 shadow flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nova senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>

          {aviso && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{aviso}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="rounded-lg py-2.5 font-semibold text-white cursor-pointer disabled:opacity-60"
            style={{ background: "#072a3c" }}
          >
            {salvando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </main>
    </>
  );
}
