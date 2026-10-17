// Solicitações feitas neste navegador (o painel não tem login; é assim que o
// franqueado reencontra as próprias solicitações e acompanha a resposta).
const KEY = "desconto_minhas_solicitacoes";

export interface MinhaSolicitacao {
  id: string;
  numero: number;
}

export function getMinhas(): MinhaSolicitacao[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMinha(s: MinhaSolicitacao): void {
  try {
    const atuais = getMinhas().filter((x) => x.id !== s.id);
    localStorage.setItem(KEY, JSON.stringify([s, ...atuais].slice(0, 30)));
  } catch {
    /* navegador sem armazenamento: segue sem histórico */
  }
}
