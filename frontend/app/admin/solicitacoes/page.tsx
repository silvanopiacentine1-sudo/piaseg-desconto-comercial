"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import { apiJson } from "../../lib/api";
import { getOperador, isAdminLoggedIn } from "../../lib/auth";
import { SOLIC_STATUS, formatBRL, formatDateTime, type Gestor, type Solicitacao, type StatusSolicitacao } from "../../lib/types";

const GESTOR_KEY = "desconto_filtro_gestor";
const FILTROS: { v: StatusSolicitacao | "todas"; label: string }[] = [
  { v: "pendente", label: "Pendentes" },
  { v: "aprovada", label: "Aprovadas" },
  { v: "reprovada", label: "Não aprovadas" },
  { v: "todas", label: "Todas" },
];

function CardSolicitacao({ s, onRespondida }: { s: Solicitacao; onRespondida: () => void }) {
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const st = SOLIC_STATUS[s.status];
  const excede = s.saldo_a_utilizar_atual !== undefined && s.valor > s.saldo_a_utilizar_atual;

  async function responder(decisao: "aprovar" | "reprovar") {
    setErro("");
    if (decisao === "reprovar" && !resposta.trim()) {
      setErro("Escreva a justificativa para o franqueado antes de não aprovar.");
      return;
    }
    if (decisao === "aprovar" && excede) {
      const ok = window.confirm(
        `O valor (${formatBRL(s.valor)}) é maior que o saldo à utilizar de ${s.seguradora_nome} ` +
          `(${formatBRL(s.saldo_a_utilizar_atual!)}). O saldo vai ficar negativo. Aprovar mesmo assim?`,
      );
      if (!ok) return;
    }
    let operador = getOperador();
    if (!operador) {
      operador = window.prompt("Informe seu nome (fica registrado na resposta):")?.trim() ?? "";
      if (!operador) return;
      localStorage.setItem("desconto_operador", operador);
    }
    setEnviando(true);
    try {
      await apiJson(`/admin/solicitacoes/${s.id}/responder`, {
        method: "POST",
        body: JSON.stringify({ decisao, resposta, operador }),
      });
      onRespondida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao responder");
      setEnviando(false);
    }
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${st.cor}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold" style={{ color: "#072a3c" }}>
            #{s.numero} · {s.seguradora_nome} · <span className="tabular-nums">{formatBRL(s.valor)}</span>
          </p>
          <p className="text-sm text-gray-600">
            {s.franqueado} → <strong>{s.gestor_nome}</strong>
          </p>
          <p className="text-xs text-gray-400">Enviada em {formatDateTime(s.created_at)}</p>
        </div>
        <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ color: st.cor, background: st.fundo }}>
          {st.label}
        </span>
      </div>

      <div className="text-sm rounded-lg p-3 mb-3 whitespace-pre-wrap" style={{ background: "#f6f6f6" }}>
        <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Justificativa do franqueado</span>
        {s.observacao || <span className="text-gray-400">Sem observação.</span>}
      </div>

      {s.status === "pendente" ? (
        <>
          <p className="text-xs mb-2" style={{ color: excede ? "#b42318" : "#555" }}>
            Saldo à utilizar hoje em {s.seguradora_nome}: <strong>{formatBRL(s.saldo_a_utilizar_atual ?? 0)}</strong>
            {excede && " — valor solicitado excede o disponível"}
          </p>
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            placeholder="Resposta ao franqueado (obrigatória para não aprovar)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          {erro && <p className="text-sm text-red-600 mb-2">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => responder("aprovar")}
              disabled={enviando}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
              style={{ background: "#1f7a4d" }}
            >
              ✓ Aprovar e reservar
            </button>
            <button
              onClick={() => responder("reprovar")}
              disabled={enviando}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
              style={{ background: "#b42318" }}
            >
              ✕ Não aprovar
            </button>
          </div>
        </>
      ) : (
        <div className="text-sm rounded-lg p-3 whitespace-pre-wrap" style={{ background: st.fundo }}>
          <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
            Resposta de {s.respondido_por} · {s.respondido_em && formatDateTime(s.respondido_em)}
          </span>
          {s.resposta || "—"}
          {s.status === "aprovada" && (
            <Link href={`/admin/seguradoras/${s.seguradora_id}`} className="block text-xs mt-2 underline" style={{ color: "#072a3c" }}>
              Ver reserva na conta da seguradora
              {s.reserva_status && ` (${s.reserva_status === "aberta" ? "em aberto" : s.reserva_status})`}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function SolicitacoesPage() {
  const router = useRouter();
  const [lista, setLista] = useState<Solicitacao[] | null>(null);
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [filtro, setFiltro] = useState<StatusSolicitacao | "todas">("pendente");
  const [gestor, setGestor] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [l, g] = await Promise.all([
        apiJson<Solicitacao[]>("/admin/solicitacoes"),
        apiJson<Gestor[]>("/admin/gestores"),
      ]);
      setLista(l);
      setGestores(g);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push("/admin/login");
      return;
    }
    try {
      setGestor(localStorage.getItem(GESTOR_KEY) ?? "");
    } catch {}
    carregar();
  }, [router, carregar]);

  function escolherGestor(v: string) {
    setGestor(v);
    try {
      localStorage.setItem(GESTOR_KEY, v);
    } catch {}
  }

  const doGestor = (lista ?? []).filter((s) => !gestor || s.gestor_id === gestor);
  const visiveis = doGestor.filter((s) => filtro === "todas" || s.status === filtro);
  const contagem = (st: StatusSolicitacao | "todas") =>
    st === "todas" ? doGestor.length : doGestor.filter((s) => s.status === st).length;

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl mb-4" style={{ color: "#072a3c" }}>
          Solicitações de reserva
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex flex-wrap gap-1 rounded-lg p-1 bg-white shadow-sm">
            {FILTROS.map((f) => (
              <button
                key={f.v}
                onClick={() => setFiltro(f.v)}
                className="rounded-md px-3 py-1.5 text-sm font-semibold cursor-pointer"
                style={filtro === f.v ? { background: "#072a3c", color: "white" } : { color: "#555" }}
              >
                {f.label} ({contagem(f.v)})
              </button>
            ))}
          </div>
          <select
            value={gestor}
            onChange={(e) => escolherGestor(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os gestores</option>
            {gestores.map((g) => (
              <option key={g.id} value={g.id}>
                Direcionadas a {g.nome}
              </option>
            ))}
          </select>
        </div>

        {gestores.length === 0 && lista && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            Nenhum gestor cadastrado — os franqueados não conseguem enviar solicitações até você cadastrar em{" "}
            <Link href="/admin/gestores" className="underline font-semibold">
              Gestores
            </Link>
            .
          </p>
        )}
        {erro && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{erro}</p>}
        {!lista && !erro && <p className="text-gray-500">Carregando...</p>}
        {lista && visiveis.length === 0 && (
          <p className="text-gray-500 bg-white rounded-xl p-6 shadow-sm">Nenhuma solicitação aqui.</p>
        )}
        <div className="flex flex-col gap-4">
          {visiveis.map((s) => (
            <CardSolicitacao key={s.id} s={s} onRespondida={carregar} />
          ))}
        </div>
      </main>
    </>
  );
}
