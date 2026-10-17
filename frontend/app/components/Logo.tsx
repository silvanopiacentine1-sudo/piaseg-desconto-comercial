import { API } from "../lib/api";

/** Logomarca da seguradora; sem logo cadastrada, mostra as iniciais. */
export default function Logo({ nome, url, size = 40 }: { nome: string; url: string | null | undefined; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${API}${url}`}
        alt={nome}
        className="object-contain bg-white rounded-md shrink-0"
        style={{ width: size * 2, height: size }}
      />
    );
  }
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-semibold shrink-0"
      style={{ width: size * 2, height: size, background: "#e8e6df", color: "#072a3c", fontSize: size * 0.38 }}
      aria-hidden
    >
      {iniciais}
    </span>
  );
}
