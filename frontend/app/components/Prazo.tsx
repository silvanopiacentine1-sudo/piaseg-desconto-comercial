"use client";

import { useEffect, useState } from "react";

/** Contagem regressiva do prazo de 48h de uma reserva. */
export default function Prazo({ expiraEm, compacto = false }: { expiraEm: string; compacto?: boolean }) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const resta = new Date(expiraEm).getTime() - agora;
  const urgente = resta < 6 * 3600_000;
  const cor = resta <= 0 ? "#6b7280" : urgente ? "#b42318" : "#8a6a1f";
  const fundo = resta <= 0 ? "#f1f1f1" : urgente ? "#fdecea" : "#fbf3e0";

  let texto: string;
  if (resta <= 0) {
    texto = "prazo encerrado — expirando";
  } else {
    const h = Math.floor(resta / 3600_000);
    const m = Math.floor((resta % 3600_000) / 60_000);
    texto = h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
    texto = compacto ? `⏳ ${texto}` : `⏳ transmitir em até ${texto}`;
  }
  const fim = new Date(expiraEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap tabular-nums"
      style={{ color: cor, background: fundo }}
      title={`Prazo para marcar "Proposta transmitida": até ${fim}. Depois disso o desconto expira e o valor volta para o saldo.`}
    >
      {texto}
    </span>
  );
}
