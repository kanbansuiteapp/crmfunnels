import type { ReactNode } from "react";

export type Variant = "line" | "total" | "pie" | "bars";
export type Metric = {
  key: string;
  label: string;
  group: "1a1" | "groups";
  title: string;
  description: string;
  needsTags?: boolean;
  variants: { kind: Variant; title: string; description: string }[];
};

const lineTotal = (line: [string, string], total: [string, string]): Metric["variants"] => [
  { kind: "line", title: line[0], description: line[1] },
  { kind: "total", title: total[0], description: total[1] },
];
const pieBars = (what: string, desc: string): Metric["variants"] => [
  { kind: "pie", title: `Distribución de contactos por ${what}`, description: `Visualiza la proporción de contactos ${desc}` },
  { kind: "bars", title: `Comparativo de contactos por ${what}`, description: `Compara la cantidad total de contactos ${desc}` },
];

export const METRICS: Metric[] = [
  { key: "new_contacts", label: "Contactos nuevos", group: "1a1", title: "Contactos nuevos", description: "Visualiza cuántos contactos nuevos se agregaron en el periodo seleccionado.",
    variants: lineTotal(["Evolución diaria", "Visualiza cómo varía el registro de nuevos contactos."], ["Total registrado", "Muestra la suma total de contactos registrados en el periodo."]) },
  { key: "by_tag", label: "Contactos por tag", group: "1a1", title: "Contactos por tag", description: "Mide y compara cuántos contactos tiene cada tag en el periodo seleccionado.", needsTags: true,
    variants: pieBars("tag", "que tiene cada tag de forma gráfica y clara.") },
  { key: "by_country", label: "Contactos por país", group: "1a1", title: "Contactos por país", description: "Mide y analiza cuántos contactos tienes por país en el periodo elegido.",
    variants: pieBars("país", "según su país de origen.") },
  { key: "messages_in", label: "Mensajes recibidos", group: "1a1", title: "Mensajes recibidos", description: "Mide y analiza la cantidad de mensajes recibidos en el periodo seleccionado.",
    variants: lineTotal(["Tendencia de mensajes recibidos", "Visualiza la evolución diaria de los mensajes recibidos."], ["Total registrado", "Muestra la suma total de mensajes recibidos en el periodo."]) },
  { key: "g_members", label: "Cantidad de participantes", group: "groups", title: "Cantidad de participantes", description: "Mide la cantidad de participantes de tus grupos y comunidades.",
    variants: lineTotal(["Evolución de participantes", "Visualiza cómo varía la cantidad de participantes."], ["Total de participantes", "Muestra el total de participantes en el periodo."]) },
  { key: "g_joins_leaves", label: "Cantidad de ingresos y salidas", group: "groups", title: "Cantidad de ingresos y salidas", description: "Mide cuántas personas entran y salen de tus grupos y comunidades.",
    variants: lineTotal(["Ingresos y salidas por día", "Visualiza la evolución diaria de ingresos y salidas."], ["Total de movimientos", "Muestra el total de ingresos y salidas en el periodo."]) },
  { key: "g_clicks", label: "Cantidad de clics", group: "groups", title: "Cantidad de clics", description: "Mide los clics recibidos en los enlaces de tus grupos y comunidades.",
    variants: lineTotal(["Clics por día", "Visualiza la evolución diaria de los clics."], ["Total de clics", "Muestra el total de clics en el periodo."]) },
  { key: "g_count", label: "Cantidad de grupos/comunidades", group: "groups", title: "Cantidad de grupos/comunidades", description: "Mide cuántos grupos y comunidades tienes en el periodo elegido.",
    variants: lineTotal(["Evolución de grupos", "Visualiza cómo varía la cantidad de grupos y comunidades."], ["Total de grupos", "Muestra el total de grupos y comunidades."]) },
];

const COLORS = ["#eb6834", "#e87ba4", "#f3d06b", "#6cc4c4", "#6aa8e8"];

// miniaturas de ejemplo para cada tipo de gráfico
export const PREVIEW: Record<Variant, ReactNode> = {
  line: (
    <svg viewBox="0 0 200 110" className="h-full w-full">
      {[15, 40, 65, 90].map((y) => <line key={y} x1="10" x2="190" y1={y} y2={y} stroke="#e5e7eb" />)}
      <path d="M25 90 L55 40 Q75 18 95 30 T135 38 L170 36 V90 Z" fill="#d9f0c0" />
      <path d="M25 90 L55 40 Q75 18 95 30 T135 38 L170 36" fill="none" stroke="#8ccb4a" strokeWidth="2" />
    </svg>
  ),
  total: (
    <div className="flex h-full flex-col items-center justify-center">
      <span className="text-4xl font-bold text-[#1d1b4d]">1.384</span>
      <span className="text-xs text-slate-500">Total registrado</span>
    </div>
  ),
  pie: (
    <svg viewBox="0 0 110 110" className="h-full w-full p-2">
      {[[0, 0.46], [0.46, 0.64], [0.64, 0.94], [0.94, 0.97], [0.97, 1]].map(([a, b], i) => {
        const p = (t: number) => [55 + 50 * Math.sin(t * 2 * Math.PI), 55 - 50 * Math.cos(t * 2 * Math.PI)];
        const [x1, y1] = p(a), [x2, y2] = p(b);
        return <path key={i} d={`M55 55 L${x1} ${y1} A50 50 0 ${b - a > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={COLORS[i]} />;
      })}
    </svg>
  ),
  bars: (
    <svg viewBox="0 0 200 110" className="h-full w-full">
      {[20, 45, 70, 95].map((y) => <line key={y} x1="20" x2="190" y1={y} y2={y} stroke="#e5e7eb" />)}
      {[[50, 60], [85, 45], [120, 30], [155, 15]].map(([x, y], i) => <rect key={x} x={x} y={y} width="24" height={95 - y} fill={["#f3d06b", "#e87ba4", "#6cc4c4", "#eda55a"][i]} />)}
    </svg>
  ),
};
