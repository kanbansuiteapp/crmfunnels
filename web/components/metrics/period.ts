export type PeriodKind = "today" | "yesterday" | "last3" | "last7" | "last30" | "custom";
export type Period = { kind: PeriodKind; from?: string; to?: string }; // from/to: YYYY-MM-DD

export const PERIOD_LABEL: Record<Exclude<PeriodKind, "custom">, string> = {
  today: "Hoy", yesterday: "Ayer", last3: "Últimos 3 días", last7: "Últimos 7 días", last30: "Últimos 30 días",
};
const SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (s: string) => { const d = fromIso(s); return `${String(d.getDate()).padStart(2, "0")} ${SHORT[d.getMonth()]} ${d.getFullYear()}`; };

export function resolvePeriod(p: Period, now = new Date()): { from: string; to: string } {
  const day = (back: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back); return iso(d); };
  switch (p.kind) {
    case "today": return { from: day(0), to: day(0) };
    case "yesterday": return { from: day(1), to: day(1) };
    case "last3": return { from: day(2), to: day(0) };
    case "last7": return { from: day(6), to: day(0) };
    case "last30": return { from: day(29), to: day(0) };
    default: return { from: p.from!, to: p.to ?? p.from! };
  }
}

export function periodLabel(p: Period): string {
  if (p.kind !== "custom") return PERIOD_LABEL[p.kind];
  return p.to && p.to !== p.from ? `${fmt(p.from!)} - ${fmt(p.to)}` : fmt(p.from!);
}
