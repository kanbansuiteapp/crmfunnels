"use client";

import { useState } from "react";

// Colores categóricos en orden fijo (paleta validada: ΔE CVD ≥ 8 entre vecinos). "Otras" es neutro.
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
export const OTHER = "var(--series-other)";

const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const num = (n: number) => n.toLocaleString("es");

function niceTicks(max: number) {
  const raw = Math.max(max, 4) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p);
  return [0, 1, 2, 3, 4].map((i) => i * step);
}

function Tooltip({ x, y, title, rows }: { x: string; y: string; title: string; rows: { color: string; name: string; value: string }[] }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-md"
      style={{ left: x, top: y, transform: "translate(-50%, -110%)", borderColor: "var(--grid)" }}
    >
      <p className="mb-1 text-slate-500">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3" style={{ background: r.color }} />
          <strong className="text-slate-900">{r.value}</strong>
          <span className="text-slate-500">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

export type Daily = { d: string; messages_in: number; messages_out: number };

export function LineChart({ data, dim }: { data: Daily[]; dim?: boolean }) {
  const W = 640, H = 240, L = 40, R = 84, T = 12, B = 28;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((p) => [p.messages_in, p.messages_out]));
  const ticks = niceTicks(max);
  const top = ticks[4];
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (k: "messages_in" | "messages_out") =>
    data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (data.length - 1));
    setHover(Math.min(Math.max(i, 0), data.length - 1));
  }

  return (
    <div className="relative" style={{ opacity: dim ? 0.5 : 1, transition: "opacity .15s" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Mensajes recibidos y enviados por día" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">{num(t)}</text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
            fontSize={11} fill="var(--text-muted)">{fmtDay(data[i].d)}</text>
        ))}
        <path d={path("messages_in")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path("messages_out")} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {last && (
          <>
            <text x={W - R + 8} y={y(last.messages_in) + (last.messages_in === last.messages_out ? -4 : 4)} fontSize={11} fill="var(--text-secondary)">Recibidos</text>
            <text x={W - R + 8} y={y(last.messages_out) + (last.messages_in === last.messages_out ? 10 : 4)} fontSize={11} fill="var(--text-secondary)">Enviados</text>
          </>
        )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(data[hover].messages_in)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(data[hover].messages_out)} r={4} fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip
          x={`${(x(hover) / W) * 100}%`}
          y={`${(y(Math.max(data[hover].messages_in, data[hover].messages_out)) / H) * 100}%`}
          title={fmtDay(data[hover].d)}
          rows={[
            { color: "var(--series-1)", name: "Recibidos", value: num(data[hover].messages_in) },
            { color: "var(--series-2)", name: "Enviados", value: num(data[hover].messages_out) },
          ]}
        />
      )}
    </div>
  );
}

export type Bar = { label: string; value: number; extra?: string };

// Barras horizontales de una sola serie: etiqueta a la izquierda, valor al final de la barra
export function BarList({ bars, color = "var(--series-1)", dim, unit }: { bars: Bar[]; color?: string; dim?: boolean; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  if (bars.length === 0) return <p className="py-6 text-center text-sm text-slate-500">Sin datos en este rango.</p>;
  return (
    <ul className="space-y-2" style={{ opacity: dim ? 0.5 : 1, transition: "opacity .15s" }}>
      {bars.map((b, i) => (
        <li key={b.label} className="grid grid-cols-[110px_1fr_48px] items-center gap-2 text-sm"
          onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
          title={`${b.label}: ${num(b.value)} ${unit}${b.extra ? ` · ${b.extra}` : ""}`}>
          <span className="truncate text-slate-600">{b.label}</span>
          <span className="h-4 rounded-r" style={{ background: "var(--grid)" }}>
            <span className="block h-4 rounded-r" style={{
              width: `${(b.value / max) * 100}%`, minWidth: b.value > 0 ? 3 : 0, background: color,
              filter: hover === i ? "brightness(1.12)" : undefined,
            }} />
          </span>
          <span className="text-right font-medium text-slate-900">{num(b.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export type Slice = { name: string; n: number };

export function Donut({ slices, dim }: { slices: Slice[]; dim?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.n, 0);
  const R = 56, C = 2 * Math.PI * R, GAP = 2;
  if (total === 0) return <p className="py-6 text-center text-sm text-slate-500">Aún no hay contactos etiquetados.</p>;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-6" style={{ opacity: dim ? 0.5 : 1, transition: "opacity .15s" }}>
      <svg viewBox="0 0 160 160" width={160} height={160} role="img" aria-label="Contactos por etiqueta">
        <g transform="rotate(-90 80 80)">
          {slices.map((s, i) => {
            const len = (s.n / total) * C;
            const el = (
              <circle key={s.name} cx={80} cy={80} r={R} fill="none"
                stroke={s.name === "Otras" ? OTHER : SERIES[i % SERIES.length]}
                strokeWidth={hover === i ? 26 : 22}
                strokeDasharray={`${Math.max(len - GAP, 0.5)} ${C}`} strokeDashoffset={-acc}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x={80} y={78} textAnchor="middle" fontSize={20} fontWeight={600} fill="var(--text-primary)">
          {num(hover !== null ? slices[hover].n : total)}
        </text>
        <text x={80} y={96} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
          {hover !== null ? slices[hover].name.slice(0, 16) : "etiquetados"}
        </text>
      </svg>
      <ul className="space-y-1 text-sm">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.name === "Otras" ? OTHER : SERIES[i % SERIES.length] }} />
            <span className="text-slate-600">{s.name}</span>
            <span className="font-medium text-slate-900">{num(s.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
