import { useEffect, useRef } from "react";
import { API } from "./api";

const INTERVALO_MS = 3000;

/**
 * Chama `recarregar` sempre que algo mudar no sistema (nova solicitação,
 * resposta do gestor, lançamento...). Consulta a "versão" dos dados a cada 3s
 * — uma requisição minúscula — e só recarrega de fato quando ela muda.
 * Pausa com a aba escondida e confere na hora em que a pessoa volta para a aba.
 */
export function useAoVivo(recarregar: () => void): void {
  const ref = useRef(recarregar);
  ref.current = recarregar;

  useEffect(() => {
    let ultima: string | null = null;
    let parado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function checar() {
      if (parado) return;
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(`${API}/versao`, { cache: "no-store" });
          const { v } = await r.json();
          if (ultima !== null && v !== ultima) ref.current();
          ultima = v;
        } catch {
          /* sem conexão: tenta de novo no próximo ciclo */
        }
      }
      if (!parado) timer = setTimeout(checar, INTERVALO_MS);
    }

    function aoVoltar() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        checar();
      }
    }

    checar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      parado = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);
}
