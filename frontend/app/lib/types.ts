export type TipoLancamento = "credito" | "utilizacao" | "reserva";
export type StatusReserva = "aberta" | "utilizada" | "cancelada";

export interface Resumo {
  id: string;
  nome: string;
  logo_url: string | null;
  ativa: boolean;
  creditos: number;
  utilizado: number;
  saldo: number;
  reserva: number;
  saldo_a_utilizar: number;
  atualizado_em: string | null;
}

export interface Lancamento {
  id: string;
  seguradora_id: string;
  tipo: TipoLancamento;
  valor: number;
  descricao: string;
  franqueado: string;
  data: string;
  operador: string;
  created_at: string;
  estornado: boolean;
  estornado_por?: string;
  estornado_em?: string;
  estorno_motivo?: string;
  status?: StatusReserva;
  status_por?: string;
  status_em?: string;
  status_motivo?: string;
}

export interface PainelPublico {
  seguradoras: Pick<Resumo, "id" | "nome" | "logo_url" | "saldo" | "reserva" | "saldo_a_utilizar" | "atualizado_em">[];
  totais: { saldo: number; reserva: number; saldo_a_utilizar: number };
  atualizado_em: string | null;
}

export interface Gestor {
  id: string;
  nome: string;
  email?: string;
  ativo?: boolean;
}

export type StatusSolicitacao = "pendente" | "aprovada" | "reprovada";

export interface Solicitacao {
  id: string;
  numero: number;
  seguradora_id: string;
  seguradora_nome: string;
  valor: number;
  franqueado: string;
  gestor_id: string;
  gestor_nome: string;
  observacao: string;
  status: StatusSolicitacao;
  created_at: string;
  resposta?: string;
  respondido_por?: string;
  respondido_em?: string;
  reserva_status?: StatusReserva | "estornada";
  saldo_a_utilizar_atual?: number;
}

export const SOLIC_STATUS: Record<StatusSolicitacao, { label: string; cor: string; fundo: string }> = {
  pendente: { label: "Aguardando análise", cor: "#8a6a1f", fundo: "#fbf3e0" },
  aprovada: { label: "Aprovada", cor: "#1f7a4d", fundo: "#e8f3ec" },
  reprovada: { label: "Não aprovada", cor: "#b42318", fundo: "#fdecea" },
};

export const TIPO_LABEL: Record<TipoLancamento, string> = {
  credito: "Crédito",
  utilizacao: "Utilização",
  reserva: "Reserva",
};

export const STATUS_LABEL: Record<StatusReserva, string> = {
  aberta: "Em aberto",
  utilizada: "Utilizada",
  cancelada: "Cancelada",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(v: number): string {
  return brl.format(v);
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Aceita "1.234,56", "1234,56" ou "1234.56" e devolve número. */
export function parseValor(texto: string): number {
  const t = texto.trim().replace(/[R$\s]/g, "");
  if (!t) return NaN;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(normal);
}

export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
