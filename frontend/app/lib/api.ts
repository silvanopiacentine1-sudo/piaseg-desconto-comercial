import { getAdminPassword, logout } from "./auth";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8131";

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const password = getAdminPassword();
  const headers = new Headers(options.headers);
  if (password) headers.set("Authorization", `Bearer ${password}`);
  return fetch(`${API}${path}`, { ...options, headers });
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await apiFetch(path, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      logout();
      if (typeof window !== "undefined") window.location.href = "/admin/login?sessao_expirada=1";
    }
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? "Verifique os campos preenchidos" : data.detail;
    throw new Error(detail ?? `Erro ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function downloadFile(path: string, suggestedName: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("Não foi possível baixar o arquivo");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
