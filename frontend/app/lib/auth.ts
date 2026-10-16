const isBrowser = typeof window !== "undefined";
const STORAGE_KEY = "desconto_admin_senha";
const OPERADOR_KEY = "desconto_operador";

export function getAdminPassword(): string | null {
  return isBrowser ? localStorage.getItem(STORAGE_KEY) : null;
}

export function setAdminPassword(password: string): void {
  if (isBrowser) localStorage.setItem(STORAGE_KEY, password);
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminPassword();
}

export function getOperador(): string {
  return (isBrowser && localStorage.getItem(OPERADOR_KEY)) || "";
}

export function setOperador(nome: string): void {
  if (isBrowser) localStorage.setItem(OPERADOR_KEY, nome.trim());
}

export function logout(): void {
  if (isBrowser) localStorage.removeItem(STORAGE_KEY);
}
