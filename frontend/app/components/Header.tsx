"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "../lib/api";
import { getOperador, logout, setOperador } from "../lib/auth";

export default function Header() {
  const router = useRouter();
  const [operador, setOperadorState] = useState("");

  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    setOperadorState(getOperador());
    apiJson<{ status: string }[]>("/admin/solicitacoes")
      .then((l) => setPendentes(l.filter((s) => s.status === "pendente").length))
      .catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    router.push("/admin/login");
  }

  function trocarOperador() {
    const nome = window.prompt("Seu nome (fica registrado nos lançamentos):", operador);
    if (nome && nome.trim()) {
      setOperador(nome);
      setOperadorState(nome.trim());
    }
  }

  return (
    <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="font-heading text-lg" style={{ color: "#c2a360" }}>
          Desconto Comercial
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/admin" className="text-white/90 hover:text-white font-semibold">
            Seguradoras
          </Link>
          <Link href="/admin/solicitacoes" className="text-white/90 hover:text-white font-semibold flex items-center gap-1.5">
            Solicitações
            {pendentes > 0 && (
              <span
                className="text-xs rounded-full px-1.5 min-w-5 text-center font-bold"
                style={{ background: "#c2a360", color: "#072a3c" }}
                title={`${pendentes} aguardando análise`}
              >
                {pendentes}
              </span>
            )}
          </Link>
          <Link href="/admin/relatorio" className="text-white/90 hover:text-white font-semibold">
            Relatório
          </Link>
          <Link href="/admin/gestores" className="text-white/90 hover:text-white font-semibold">
            Gestores
          </Link>
          <Link href="/" target="_blank" className="text-white/90 hover:text-white font-semibold">
            Ver painel público ↗
          </Link>
          <Link href="/admin/backups" className="text-white/90 hover:text-white font-semibold">
            Backups
          </Link>
          <Link href="/admin/senha" className="text-white/90 hover:text-white font-semibold">
            Senha
          </Link>
          <button
            onClick={trocarOperador}
            className="text-xs rounded-full px-3 py-1 cursor-pointer"
            style={{ background: "#123a52", color: "#d6bd8a" }}
            title="Trocar operador"
          >
            Operador: {operador || "—"}
          </button>
          <button onClick={handleLogout} className="text-white/90 hover:text-white font-semibold cursor-pointer">
            Sair
          </button>
        </nav>
      </div>
    </header>
  );
}
