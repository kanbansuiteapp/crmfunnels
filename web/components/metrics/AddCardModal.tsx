"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { METRICS, PREVIEW, type Metric, type Variant } from "./metricsCatalog";
import { PeriodPicker } from "./PeriodPicker";
import { periodLabel, type Period, type PeriodKind } from "./period";

export type NewCard = { title: string; period: Period; metric: string; variant: Variant; tags: string[] };

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: "today", label: "Hoy" }, { kind: "yesterday", label: "Ayer" }, { kind: "last3", label: "Últimos 3 días" },
  { kind: "last7", label: "Últimos 7 días" }, { kind: "last30", label: "Últimos 30 días" }, { kind: "custom", label: "Personalizado" },
];

export function AddCardModal({ onClose, onAdd }: { onClose: () => void; onAdd: (c: NewCard) => void }) {
  const [metric, setMetric] = useState<Metric>(METRICS[0]);
  const [variant, setVariant] = useState<Variant>(METRICS[0].variants[0].kind);
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<PeriodKind>("today");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [allTags, setAllTags] = useState<{ id: string; name: string }[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    createClient().from("tags").select("id,name").order("name").then(({ data }) => setAllTags((data ?? []) as { id: string; name: string }[]));
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !picking && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, picking]);

  const choose = (m: Metric) => { setMetric(m); setVariant(m.variants[0].kind); setTags([]); };
  const onPeriod = (v: PeriodKind) => { setPeriod(v); if (v === "custom") setPicking(true); };
  const finalPeriod: Period | null = period === "custom" ? (custom ? { kind: "custom", ...custom } : null) : { kind: period };
  const valid = name.trim().length > 0 && !!finalPeriod && (!metric.needsTags || tags.length > 0);

  const Group = ({ id, label }: { id: Metric["group"]; label: string }) => (
    <div className="mt-6">
      <h3 className="px-3 text-sm font-bold uppercase tracking-wide text-slate-500">{label}</h3>
      <ul className="mt-2 space-y-1">
        {METRICS.filter((m) => m.group === id).map((m) => (
          <li key={m.key}>
            <button onClick={() => choose(m)}
              className={`w-full rounded-lg px-3 py-3 text-left text-[15px] ${m.key === metric.key ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500 hover:bg-slate-50"}`}>
              {m.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Añadir tarjeta" className="flex max-h-[92vh] w-full max-w-[1500px] overflow-hidden rounded-xl bg-white shadow-2xl">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-slate-100 p-6 md:block">
          <h2 className="text-2xl font-bold text-[#1d1b4d]">Añadir tarjeta</h2>
          <p className="mt-2 text-slate-500">Selecciona la opción que mejor se adapte a tus necesidades.</p>
          <div className="mt-5"><Group id="1a1" label="Interacciones 1 a 1" /></div>
          <hr className="mt-4" />
          <Group id="groups" label="Grupos y comunidades" />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
            <div>
              <h2 className="text-2xl font-bold text-[#1d1b4d]">{metric.title}</h2>
              <p className="mt-2 text-slate-500">{metric.description}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-3xl leading-none text-slate-700 hover:text-black">×</button>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {/* selector móvil */}
            <select className="mb-4 w-full rounded-md border p-2 md:hidden" value={metric.key} onChange={(e) => choose(METRICS.find((m) => m.key === e.target.value)!)}>
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>

            <div className="flex flex-wrap gap-5">
              {metric.variants.map((v) => (
                <button key={v.kind} onClick={() => setVariant(v.kind)} aria-pressed={variant === v.kind}
                  className={`w-60 overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${variant === v.kind ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-100 hover:border-slate-300"}`}>
                  <div className="h-40 border-b border-slate-100 p-2">{PREVIEW[v.kind]}</div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-slate-900">{v.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{v.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <label className="mt-8 block text-sm font-semibold text-slate-900">Nombre del gráfico <span className="text-red-500">*</span></label>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ingresa el nombre del gráfico"
              className="mt-2 w-full rounded-md border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400" />
            <p className="mt-1 text-xs text-slate-500">{name.length}/60 caracteres</p>

            {metric.needsTags && (
              <>
                <label className="mt-5 block text-sm font-semibold text-slate-900">Selecciona los tags a analizar <span className="text-red-500">*</span></label>
                <div className="mt-2 rounded-md border border-slate-200 p-3">
                  {allTags === null ? <span className="text-sm text-slate-400">Cargando...</span>
                    : allTags.length === 0 ? <span className="text-sm text-slate-400">Aún no tienes tags.</span>
                    : <div className="flex flex-wrap gap-2">
                        {allTags.map((t) => {
                          const on = tags.includes(t.id);
                          return (
                            <button key={t.id} onClick={() => setTags(on ? tags.filter((x) => x !== t.id) : [...tags, t.id])}
                              className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>{t.name}</button>
                          );
                        })}
                      </div>}
                </div>
              </>
            )}

            <label className="mt-5 block text-sm font-semibold text-slate-900">Selecciona el período a analizar</label>
            <select value={period} onChange={(e) => onPeriod(e.target.value as PeriodKind)}
              className="mt-2 w-full rounded-md border border-slate-200 px-4 py-3 text-sm text-indigo-600 outline-none focus:border-indigo-400">
              {PERIODS.map((p) => <option key={p.kind} value={p.kind}>{p.kind === "custom" && custom ? periodLabel({ kind: "custom", ...custom }) : p.label}</option>)}
            </select>
            {period === "custom" && !custom && <p className="mt-1 text-xs text-slate-500">Elige las fechas en el calendario.</p>}
          </div>

          <footer className="flex justify-end gap-3 border-t border-slate-100 p-4">
            <button onClick={onClose} className="rounded-md border border-indigo-500 px-6 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">Cancelar</button>
            <button disabled={!valid} onClick={() => onAdd({ title: name.trim(), period: finalPeriod!, metric: metric.key, variant, tags })}
              className="rounded-md bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">Agregar tarjeta</button>
          </footer>
        </section>
      </div>

      {picking && (
        <PeriodPicker
          onCancel={() => { setPicking(false); if (!custom) setPeriod("today"); }}
          onApply={(from, to) => { setCustom({ from, to }); setPicking(false); }}
        />
      )}
    </div>
  );
}
