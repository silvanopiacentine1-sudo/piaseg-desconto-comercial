"use client";

import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API } from "../../lib/api";
import { useAoVivo } from "../../lib/aoVivo";
import { addMinha } from "../../lib/minhas";
import { SOLIC_STATUS, formatBRL, formatDateTime, type Solicitacao } from "../../lib/types";

const RESERVA_TEXTO: Record<string, string> = {
  aberta: "Valor reservado — aguardando utilização.",
  utilizada: "Desconto já utilizado.",
  cancelada: "Reserva cancelada pela equipe Piaseg.",
  estornada: "Reserva estornada pela equipe Piaseg.",
};

function Detalhe({ id }: { id: string }) {
  const params = useSearchParams();
  const [s, setS] = useState<Solicitacao | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    fetch(`${API}/solicitacoes/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data: Solicitacao = await r.json();
        setS(data);
        addMinha({ id: data.id, numero: data.numero });
      })
      .catch(() => setErro("Solicitação não encontrada."));
  }, [id]);

  useEffect(carregar, [carregar]);
  useAoVivo(carregar); // a resposta do gestor aparece aqui sem refresh

  if (erro) return <p className="text-red-700">{erro}</p>;
  if (!s) return <p className="text-gray-500">Carregando...</p>;
  const st = SOLIC_STATUS[s.status];

  return (
    <>
      {s.teste && (
        <div className="text-sm rounded-lg px-4 py-3 mb-4" style={{ background: "#ede9fe", color: "#4c1d95" }}>
          🎓 <strong>Solicitação de treinamento</strong> — não altera o saldo real.{" "}
          <Link href="/?treino=1" className="underline font-semibold">
            Ver no painel em modo treinamento
          </Link>
        </div>
      )}
      {params.get("nova") && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
          ✓ Solicitação enviada para <strong>{s.gestor_nome}</strong>. Guarde o protocolo <strong>#{s.numero}</strong> — ela
          também fica listada em &quot;Minhas solicitações&quot; no painel, neste navegador.
        </div>
      )}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="font-heading text-2xl" style={{ color: "#072a3c" }}>
            Solicitação #{s.numero}
          </h1>
          <span className="text-sm font-semibold rounded-full px-3 py-1" style={{ color: st.cor, background: st.fundo }}>
            {st.label}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-500">Seguradora</dt>
          <dd className="font-medium">{s.seguradora_nome}</dd>
          <dt className="text-gray-500">Valor</dt>
          <dd className="font-medium tabular-nums">{formatBRL(s.valor)}</dd>
          <dt className="text-gray-500">Franqueado</dt>
          <dd>{s.franqueado}</dd>
          <dt className="text-gray-500">Gestor</dt>
          <dd>{s.gestor_nome}</dd>
          <dt className="text-gray-500">Enviada em</dt>
          <dd>{formatDateTime(s.created_at)}</dd>
        </dl>
        {s.observacao && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Sua observação</p>
            <p className="text-sm whitespace-pre-wrap rounded-lg p-3" style={{ background: "#f6f6f6" }}>
              {s.observacao}
            </p>
          </div>
        )}
        {s.status !== "pendente" && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
              Resposta do gestor {s.gestor_nome} {s.respondido_em && `· ${formatDateTime(s.respondido_em)}`}
            </p>
            <p
              className="text-sm whitespace-pre-wrap rounded-lg p-3"
              style={{ background: st.fundo, borderLeft: `3px solid ${st.cor}` }}
            >
              {s.resposta || (s.status === "aprovada" ? "Aprovada." : "Não aprovada.")}
            </p>
          </div>
        )}
        {s.status === "aprovada" && s.reserva_status && (
          <p className="text-sm text-gray-600 mt-3">{RESERVA_TEXTO[s.reserva_status]}</p>
        )}
        {s.status === "pendente" && (
          <p className="text-sm text-gray-500 mt-4">Aguardando a análise do gestor. Volte a esta página para ver a resposta.</p>
        )}
      </div>
    </>
  );
}

export default function SolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <header className="w-full" style={{ background: "#072a3c", borderBottom: "3px solid #c2a360" }}>
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href="/" className="font-heading text-lg" style={{ color: "#c2a360" }}>
            Desconto Comercial
          </Link>
        </div>
      </header>
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          ← Voltar ao painel
        </Link>
        <div className="mt-3">
          <Suspense>
            <Detalhe id={id} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
