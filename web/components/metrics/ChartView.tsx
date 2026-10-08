"use client";

import type { Variant } from "./metricsCatalog";

export type Point = { label: string; value: number };
export type MetricData = { total: number; series: Point[] };

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#9a9994"];
const nf = new Intl.NumberFormat("es-PE");
const dayLabel = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : s);

function Empty({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">{text}</div>;
}

function Line({ series }: { series: Point[] }) {
  const W = 360, H = 170, L = 34, B = 24, T = 10, R = 8;
  const max = Math.max(1, ...series.map((p) => p.value));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (series.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const pts = series.map((p, i) => `${x(i)},${y(p.value)}`);
  const step = Math.max(1, Math.ceil(series.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Evolución diaria">
      {[0, 1, 2, 3, 4].map((g) => {
        const v = (top * g) / 4;
        return (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid, #e7e6e2)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#6b6a66">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
          </g>
        );
      })}
      {series.length > 1 && <path d={`M${x(0)},${y(0)} L${pts.join(" L")} L${x(series.length - 1)},${y(0)} Z`} fill="#2a78d6" opacity="0.12" />}
      <polyline points={pts.join(" ")} fill="none" stroke="#2a78d6" strokeWidth="2" strokeLinejoin="round" />
      {series.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="3" fill="#fff" stroke="#2a78d6" strokeWidth="2"><title>{`${dayLabel(p.label)}: ${nf.format(p.value)}`}</title></circle>
          {i % step === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b6a66">{dayLabel(p.label)}</text>}
        </g>
      ))}
    </svg>
  );
}

function Pie({ series }: { series: Point[] }) {
  const total = series.reduce((a, p) => a + p.value, 0);
  let acc = 0;
  const pt = (t: number): [number, number] => [60 + 54 * Math.sin(t * 2 * Math.PI), 60 - 54 * Math.cos(t * 2 * Math.PI)];
  return (
    <div className="flex h-full items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0" role="img" aria-label="Distribución">
        {series.length === 1 ? <circle cx="60" cy="60" r="54" fill={COLORS[0]} /> : series.map((p, i) => {
          const a = acc / total; acc += p.value; const b = acc / total;
          const [x1, y1] = pt(a), [x2, y2] = pt(b);
          return <path key={p.label} d={`M60 60 L${x1} ${y1} A54 54 0 ${b - a > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1"><title>{`${p.label}: ${nf.format(p.value)}`}</title></path>;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs text-slate-600">
        {series.slice(0, 8).map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate">{p.label}</span>
            <span className="ml-auto font-medium text-slate-800">{nf.format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ series }: { series: Point[] }) {
  const W = 360, H = 170, L = 34, B = 30, T = 10;
  const max = Math.max(1, ...series.map((p) => p.value));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const bw = (W - L - 8) / series.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Comparativo">
      {[0, 1, 2, 3, 4].map((g) => {
        const v = (top * g) / 4;
        return (
          <g key={g}>
            <line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#e7e6e2" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#6b6a66">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
          </g>
        );
      })}
      {series.map((p, i) => (
        <g key={p.label}>
          <rect x={L + i * bw + bw * 0.15} y={y(p.value)} width={bw * 0.7} height={y(0) - y(p.value)} fill={COLORS[i % COLORS.length]} rx="2"><title>{`${p.label}: ${nf.format(p.value)}`}</title></rect>
          <text x={L + i * bw + bw / 2} y={H - 12} textAnchor="middle" fontSize="10" fill="#6b6a66">{p.label.length > 9 ? p.label.slice(0, 8) + "…" : p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function ChartView({ variant, data, loading, error }: { variant: Variant; data: MetricData | null; loading: boolean; error: boolean }) {
  if (loading) return <Empty text="Cargando..." />;
  if (error || !data) return <Empty text="No se pudieron cargar los datos" />;
  if (variant === "total") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <span className="text-5xl font-bold text-[#1d1b4d]">{nf.format(data.total)}</span>
        <span className="mt-1 text-sm text-slate-500">Total registrado</span>
      </div>
    );
  }
  if (data.series.length === 0) return <Empty text={data.total > 0 ? "Sin historial diario para este período" : "Sin datos en este período"} />;
  if (variant !== "line" && data.series.every((p) => p.value === 0)) return <Empty text="Sin datos en este período" />;
  return <div className="min-h-[170px] flex-1">{variant === "line" ? <Line series={data.series} /> : variant === "pie" ? <Pie series={data.series.filter((p) => p.value > 0)} /> : <Bars series={data.series} />}</div>;
}
