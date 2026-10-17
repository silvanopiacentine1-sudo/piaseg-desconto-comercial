"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import { apiJson } from "../../lib/api";
import { isAdminLoggedIn } from "../../lib/auth";
import type { Gestor } from "../../lib/types";

export default function GestoresPage() {
  const router = useRouter();
  const [lista, setLista] = useState<Gestor[] | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLista(await apiJson<Gestor[]>("/admin/gestores"));
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

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      await apiJson("/admin/gestores", { method: "POST", body: JSON.stringify({ nome, email }) });
      setNome("");
      setEmail("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao cadastrar");
    }
  }

  async function alternar(g: Gestor) {
    setErro("");
    try {
      await apiJson(`/admin/gestores/${g.id}`, {
        method: "PUT",
        body: JSON.stringify({ nome: g.nome, email: g.email ?? "", ativo: !g.ativo }),
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function renomear(g: Gestor) {
    const novo = window.prompt("Nome do gestor:", g.nome)?.trim();
    if (!novo || novo === g.nome) return;
    try {
      await apiJson(`/admin/gestores/${g.id}`, {
        method: "PUT",
        body: JSON.stringify({ nome: novo, email: g.email ?? "", ativo: g.ativo }),
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function excluir(g: Gestor) {
    if (!window.confirm(`Excluir ${g.nome}?`)) return;
    setErro("");
    try {
      await apiJson(`/admin/gestores/${g.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl mb-2" style={{ color: "#072a3c" }}>
          Gestores comerciais
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          São as pessoas que o franqueado pode escolher ao solicitar uma reserva de verba. Gestor desativado deixa de aparecer
          no formulário.
        </p>

        <form onSubmit={criar} className="bg-white rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end mb-6">
          <div className="flex-1 min-w-44">
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div className="flex-1 min-w-44">
            <label className="block text-sm font-medium mb-1">E-mail (opcional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg px-5 py-2 font-semibold text-white cursor-pointer"
            style={{ background: "#072a3c" }}
          >
            + Cadastrar
          </button>
        </form>

        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {!lista && !erro && <p className="text-gray-500">Carregando...</p>}
        {lista && (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {lista.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum gestor cadastrado.</p>}
            {lista.map((g) => (
              <div key={g.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${g.ativo ? "" : "opacity-50"}`}>
                <div>
                  <p className="font-medium">
                    {g.nome} {!g.ativo && <span className="text-xs text-gray-500">(inativo)</span>}
                  </p>
                  {g.email && <p className="text-xs text-gray-500">{g.email}</p>}
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => renomear(g)} className="text-gray-600 hover:underline cursor-pointer">
                    Renomear
                  </button>
                  <button onClick={() => alternar(g)} className="text-gray-600 hover:underline cursor-pointer">
                    {g.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button onClick={() => excluir(g)} className="text-red-600 hover:underline cursor-pointer">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
