import type { EventoHistorico } from "../lib/types";
import { formatDateTime } from "../lib/types";

const ROTULO: Record<string, { txt: string; cor: string }> = {
  criada: { txt: "Pedido registrado", cor: "#072a3c" },
  aprovada: { txt: "Aprovada pelo gestor", cor: "#1d5fb8" },
  aprovada_ressalva: { txt: "⚠ Aprovada com ressalva", cor: "#9a5b00" },
  transmitida: { txt: "✓ Proposta transmitida", cor: "#1f7a4d" },
  nao_transmitida: { txt: "✕ Proposta não transmitida (franqueado desistiu)", cor: "#4b5563" },
  transmissao_desfeita: { txt: "Transmissão desfeita pelo admin", cor: "#b45309" },
  cancelada: { txt: "Reserva cancelada", cor: "#6b7280" },
  reprovada: { txt: "Não aprovada", cor: "#b42318" },
  expirada: { txt: "Desconto expirado", cor: "#b42318" },
  reaberta: { txt: "Reaberta pelo admin (+48h)", cor: "#2a78d6" },
};

/** Linha do tempo da solicitação — evidência de quando cada coisa aconteceu. */
export default function Historico({ eventos }: { eventos: EventoHistorico[] }) {
  return (
    <ol className="relative border-l-2 border-gray-200 ml-1.5 flex flex-col gap-3">
      {eventos.map((e, i) => {
        const r = ROTULO[e.tipo] ?? { txt: e.tipo, cor: "#072a3c" };
        return (
          <li key={i} className="pl-4 relative">
            <span
              className="absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 border-white"
              style={{ background: r.cor }}
              aria-hidden
            />
            <p className="text-xs text-gray-500 tabular-nums">{formatDateTime(e.em)}</p>
            <p className="text-sm">
              <strong style={{ color: r.cor }}>{r.txt}</strong>
              {e.por && <span className="text-gray-600"> · por {e.por}</span>}
            </p>
            {e.detalhe && <p className="text-xs text-gray-600 whitespace-pre-wrap">{e.detalhe}</p>}
          </li>
        );
      })}
    </ol>
  );
}
