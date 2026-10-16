"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOperador, logout, setOperador } from "../lib/auth";

export default function Header() {
  const router = useRouter();
  const [operador, setOperadorState] = useState("");

  useEffect(() => {
    setOperadorState(getOperador());
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
