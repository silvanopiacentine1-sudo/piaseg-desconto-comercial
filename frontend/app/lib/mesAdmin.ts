import { useEffect, useState } from "react";
import { apiJson } from "./api";
import { mesAtual } from "./types";

// Mês escolhido no admin vale para todas as telas (lista, seguradora, relatório)
// durante a sessão do navegador; ao abrir de novo, volta para o mês atual.
const KEY = "desconto_admin_mes";

export function useMesAdmin(): [string, (m: string) => void, string[]] {
  const [mes, setMesState] = useState(mesAtual());
  const [meses, setMeses] = useState<string[]>([mesAtual()]);

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(KEY);
      if (salvo) setMesState(salvo);
    } catch {}
    apiJson<string[]>("/admin/meses")
      .then(setMeses)
      .catch(() => {});
  }, []);

  function setMes(m: string) {
    setMesState(m);
    try {
      sessionStorage.setItem(KEY, m);
    } catch {}
  }

  return [mes, setMes, meses];
}
