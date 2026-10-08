"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarList, Donut, LineChart, type Daily, type Slice } from "./charts";

type Metrics = {
  kpis: {
    new_contacts: number; conversations: number; messages_in: number; messages_out: number; ai_out: number;
    deals_won: number; deals_won_value: number; open_value: number;
  };
  daily: (Daily & { new_contacts: number })[];
  stages: { name: string; deals: number; value: number }[];
  agents: { name: string; n: number }[];
  tags: Slice[];
};

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const PRESETS = [{ label: "7 días", days: 6 }, { label: "30 días", days: 29 }, { label: "90 días", days: 89 }];
const money = (n: number) => n.toLocaleString("es", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function DashboardClient({ tags, channels }: { tags: { id: string; name: string }[]; channels: { id: string; name: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));
  const [tag, setTag] = useState("");
  const [channel, setChannel] = useState("");
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    supabase
      .rpc("dashboard_metrics", { p_from: from, p_to: to, p_tag: tag || null, p_channel: channel || null })
      .then(({ data, error }) => {
        if (n !== seq.current) return; // llegó una respuesta más nueva
        setLoading(false);
        if (error) return setErr(error.message);
        setErr(null);
        setData(data as Metrics); // mientras recarga se conserva el render anterior
      });
  }, [supabase, from, to, tag, channel]);

  const k = data?.kpis;
  const aiShare = k && k.messages_out > 0 ? Math.round((k.ai_out / k.messages_out) * 100) : 0;
  const tiles = k
    ? [
        { label: "Contactos nuevos", value: k.new_contacts.toLocaleString("es") },
        { label: "Conversaciones activas", value: k.conversations.toLocaleString("es") },
        { label: "Mensajes recibidos", value: k.messages_in.toLocaleString("es") },
        { label: "Mensajes enviados", value: k.messages_out.toLocaleString("es"), sub: `${aiShare}% por IA` },
        { label: "Ventas ganadas", value: k.deals_won.toLocaleString("es"), sub: money(k.deals_won_value) },
        { label: "Valor en pipeline", value: money(k.open_value), sub: "deals abiertos" },
      ]
    : [];

  const sel = "rounded border bg-white px-2 py-1.5 text-sm";
  const card = "rounded-xl border bg-white p-4";

  return (
    <div className="viz-root space-y-5">
      {/* filtros: una fila sobre todo el contenido */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border bg-white text-sm" role="group" aria-label="Rango rápido">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setFrom(daysAgo(p.days)); setTo(daysAgo(0)); }}
              className={`px-3 py-1.5 ${from === daysAgo(p.days) && to === daysAgo(0) ? "bg-sky-50 font-semibold" : ""}`}>
              {p.label}
            </button>
          ))}
        </div>
        <input type="date" aria-label="Desde" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={sel} />
        <span className="text-slate-400">→</span>
        <input type="date" aria-label="Hasta" value={to} min={from} max={daysAgo(0)} onChange={(e) => e.target.value && setTo(e.target.value)} className={sel} />
        <select aria-label="Etiqueta" value={tag} onChange={(e) => setTag(e.target.value)} className={sel}>
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)} className={sel}>
          <option value="">Todos los canales</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setTable(!table)} className="ml-auto text-sm text-sky-700 underline">
          {table ? "Ver gráficos" : "Ver como tabla"}
        </button>
      </div>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}

      {!data ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : table ? (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">Actividad diaria</caption>
            <thead><tr className="text-slate-500"><th>Día</th><th>Recibidos</th><th>Enviados</th><th>Contactos nuevos</th></tr></thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.d} className="border-t"><td>{d.d}</td><td>{d.messages_in}</td><td>{d.messages_out}</td><td>{d.new_contacts}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="mt-6 w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">Pipeline por etapa</caption>
            <thead><tr className="text-slate-500"><th>Etapa</th><th>Deals</th><th>Valor</th></tr></thead>
            <tbody>
              {data.stages.map((s) => <tr key={s.name} className="border-t"><td>{s.name}</td><td>{s.deals}</td><td>{money(s.value)}</td></tr>)}
            </tbody>
          </table>
          <table className="mt-6 w-full text-left text-sm">
            <caption className="mb-2 text-left font-semibold">Conversaciones por agente y contactos por etiqueta</caption>
            <tbody>
              {data.agents.map((a) => <tr key={"a" + a.name} className="border-t"><td>Agente: {a.name}</td><td>{a.n}</td></tr>)}
              {data.tags.map((t) => <tr key={"t" + t.name} className="border-t"><td>Etiqueta: {t.name}</td><td>{t.n}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.label} className={card} style={{ opacity: loading ? 0.5 : 1, transition: "opacity .15s" }}>
                <p className="text-xs text-slate-500">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{t.value}</p>
                {t.sub && <p className="text-xs text-slate-500">{t.sub}</p>}
              </div>
            ))}
          </div>

          <div className={card}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Mensajes por día</h2>
              <span className="flex gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: "var(--series-1)" }} />Recibidos</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: "var(--series-2)" }} />Enviados</span>
              </span>
            </div>
            <LineChart data={data.daily} dim={loading} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className={card}>
              <h2 className="mb-3 text-sm font-semibold">Deals por etapa</h2>
              <BarList unit="deals" dim={loading}
                bars={data.stages.map((s) => ({ label: s.name, value: s.deals, extra: money(s.value) }))} />
            </div>
            <div className={card}>
              <h2 className="mb-3 text-sm font-semibold">Conversaciones por agente</h2>
              <BarList unit="conversaciones" dim={loading} bars={data.agents.map((a) => ({ label: a.name, value: a.n }))} />
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-3 text-sm font-semibold">Contactos por etiqueta</h2>
            <Donut slices={data.tags} dim={loading} />
          </div>
        </>
      )}
    </div>
  );
}
