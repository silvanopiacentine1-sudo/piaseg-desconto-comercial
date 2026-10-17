import { apiFetch } from "./api";

const MAX = 2 * 1024 * 1024;

export async function enviarLogo(seguradoraId: string, arquivo: File): Promise<void> {
  if (arquivo.size > MAX) throw new Error("A logo pode ter no máximo 2 MB.");
  const form = new FormData();
  form.append("arquivo", arquivo);
  const res = await apiFetch(`/admin/seguradoras/${seguradoraId}/logo`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Não foi possível enviar a logo");
  }
}
