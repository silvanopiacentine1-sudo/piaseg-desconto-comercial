export type TipoLancamento = "credito" | "utilizacao" | "reserva";
export type StatusReserva = "aberta" | "utilizada" | "cancelada";

export interface Especial {
  categoria: string;
  saldo: number;
  reserva: number;
  em_analise: number;
  liberado: number;
  saldo_a_utilizar: number;
}

export interface Resumo {
  id: string;
  nome: string;
  especiais?: Especial[];
  logo_url: string | null;
  ativa: boolean;
  creditos: number;
  utilizado: number;
  saldo: number;
  reserva: number;
  em_analise: number;
  liberado: number;
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
  solicitacao_id?: string;
  teste?: boolean;
  categoria?: string;
}

export type ResumoPublico = Pick<
  Resumo,
  "id" | "nome" | "logo_url" | "saldo" | "reserva" | "em_analise" | "liberado" | "saldo_a_utilizar" | "atualizado_em"
>;

export interface PainelPublico {
  mes: string;
  meses: string[];
  seguradoras: (ResumoPublico & { especiais: Especial[] })[];
  totais: { saldo: number; reserva: number; saldo_a_utilizar: number };
  atualizado_em: string | null;
}

export type SituacaoMov =
  | "credito"
  | "em_analise"
  | "aprovada"
  | "aprovada_utilizada"
  | "reprovada"
  | "reservada"
  | "utilizada"
  | "cancelada";

export interface Movimento {
  id: string;
  origem: "lancamento" | "solicitacao";
  tipo: string;
  situacao: SituacaoMov;
  numero?: number;
  data: string;
  valor: number;
  efeito: number;
  saldo_apos: number;
  franqueado: string;
  descricao?: string;
  observacao?: string;
  gestor_nome?: string;
  canal?: string | null;
  criado_por?: string | null;
  teste?: boolean;
  nota_gestor?: string;
  categoria?: string;
  resposta?: string;
  respondido_por?: string;
  respondido_em?: string | null;
}

export const SITUACAO: Record<SituacaoMov, { label: string; cor: string; fundo: string }> = {
  credito: { label: "Crédito de verba", cor: "#072a3c", fundo: "#e6edf1" },
  em_analise: { label: "Em análise", cor: "#8a6a1f", fundo: "#fbf3e0" },
  aprovada: { label: "Aprovada · liberada", cor: "#1f7a4d", fundo: "#e8f3ec" },
  aprovada_utilizada: { label: "Aprovada · utilizada", cor: "#1f7a4d", fundo: "#e8f3ec" },
  reservada: { label: "Reservada", cor: "#1f7a4d", fundo: "#e8f3ec" },
  utilizada: { label: "Utilizada", cor: "#1f7a4d", fundo: "#e8f3ec" },
  reprovada: { label: "Não aprovada", cor: "#b42318", fundo: "#fdecea" },
  cancelada: { label: "Cancelada", cor: "#6b7280", fundo: "#f1f1f1" },
};

const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Rótulo da verba: "" = geral; senão nome do desconto especial. */
export function nomeVerba(categoria?: string | null): string {
  return categoria ? `Especial: ${categoria}` : "Verba geral";
}

export const ESPECIAL_COR = { cor: "#9a3412", fundo: "#fff1e8" }; // selo laranja do desconto especial

export const FRANQUEADO_TESTE = "FRANQUEADO TESTE (treinamento)";

export function formatMes(mes: string): string {
  if (mes === "todos") return "Todos os meses";
  const [y, m] = mes.split("-");
  return `${MESES_PT[Number(m) - 1]}/${y}`;
}

export function mesAtual(): string {
  return hojeISO().slice(0, 7);
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
  teste?: boolean;
  nota_gestor?: string;
  categoria?: string;
  origem?: "gestor";
  canal?: string;
  criado_por?: string;
}

export const SOLIC_STATUS: Record<StatusSolicitacao, { label: string; cor: string; fundo: string }> = {
  pendente: { label: "Aguardando análise", cor: "#8a6a1f", fundo: "#fbf3e0" },
  aprovada: { label: "Aprovada · liberada", cor: "#1f7a4d", fundo: "#e8f3ec" },
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
  // padrão brasileiro: "3.000" e "1.234.567" são milhares; "1500.50" (ponto com 1-2 casas) é decimal
  const normal = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t;
  return Number(normal);
}

export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
