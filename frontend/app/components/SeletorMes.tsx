import { formatMes } from "../lib/types";

export default function SeletorMes({
  mes,
  meses,
  onChange,
  todos = false,
}: {
  mes: string;
  meses: string[];
  onChange: (m: string) => void;
  todos?: boolean;
}) {
  const opcoes = meses.includes(mes) || mes === "todos" ? meses : [mes, ...meses];
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Mês</span>
      <select
        value={mes}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 bg-white font-semibold"
        style={{ color: "#072a3c" }}
      >
        {opcoes.map((m) => (
          <option key={m} value={m}>
            {formatMes(m)}
          </option>
        ))}
        {todos && <option value="todos">Todos os meses</option>}
      </select>
    </label>
  );
}
