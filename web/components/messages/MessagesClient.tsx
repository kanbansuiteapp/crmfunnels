"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type St = "scheduled" | "sending" | "done" | "failed" | "cancelled";
export type GroupMessage = {
  id: string; name: string; message: string; scheduled_at: string; status: St; total: number; sent: number; failed: number; read_rate: number | null; blocks: { type: string; text?: string; media_name?: string; poll?: { question: string }; contact?: { name: string } }[];
  targets: { status: string; error: string | null; group: { name: string } | null }[];
};

const STATUS: Record<St, { label: string; cls: string }> = {
  scheduled: { label: "Programado", cls: "bg-indigo-50 text-indigo-700" },
  sending: { label: "Enviando", cls: "bg-amber-50 text-amber-700" },
  done: { label: "Finalizado", cls: "bg-green-50 text-green-700" },
  failed: { label: "Fallido", cls: "bg-red-50 text-red-700" },
  cancelled: { label: "Cancelado", cls: "bg-slate-100 text-slate-700" },
};
type ColKey = "date" | "read" | "status";
const COLS: { key: ColKey; label: string }[] = [{ key: "date", label: "Fecha para envío" }, { key: "read", label: "Tasa de lectura" }, { key: "status", label: "Estado" }];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "")}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

function Ring({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500">—</span>;
  const r = 20, c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center" role="img" aria-label={`Tasa de lectura ${value}%`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={value >= 50 ? "#34c38f" : "#94a3b8"} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span className="text-[11px] font-bold text-slate-800">{value}%</span>
    </span>
  );
}

function Month({ items, onOpen }: { items: GroupMessage[]; onOpen: (m: GroupMessage) => void }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const start = new Date(cur); start.setDate(1 - ((cur.getDay() + 6) % 7)); // semana desde lunes
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const by = new Map<string, GroupMessage[]>();
  for (const m of items) { const k = key(new Date(m.scheduled_at)); by.set(k, [...(by.get(k) ?? []), m]); }
  return (
    <div className="rounded-2xl border border-slate-300 bg-white">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <button onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() - 1, 1))} aria-label="Mes anterior" className="px-3 text-xl">‹</button>
        <h2 className="text-lg font-semibold capitalize text-slate-900">{cur.toLocaleDateString("es", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() + 1, 1))} aria-label="Mes siguiente" className="px-3 text-xl">›</button>
      </div>
      <div className="grid grid-cols-7 border-b text-center text-sm font-semibold uppercase text-slate-600">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => (
          <div key={key(d)} className={`min-h-28 border-b border-r p-2 ${d.getMonth() === cur.getMonth() ? "" : "bg-slate-50 text-slate-400"}`}>
            <p className="mb-1 text-sm font-medium">{d.getDate()}</p>
            {(by.get(key(d)) ?? []).slice(0, 3).map((m) => (
              <button key={m.id} onClick={() => onOpen(m)} className={`mb-1 block w-full truncate rounded px-2 py-1 text-left text-xs font-medium ${STATUS[m.status].cls}`} title={m.name}>{m.name}</button>
            ))}
            {(by.get(key(d))?.length ?? 0) > 3 && <p className="text-xs text-slate-500">+{(by.get(key(d))?.length ?? 0) - 3} más</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessagesClient({ items, isAdmin }: { items: GroupMessage[]; isAdmin: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "date"; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [cols, setCols] = useState<Record<ColKey, boolean>>({ date: true, read: true, status: true });
  const [menu, setMenu] = useState<null | "cols" | "filter">(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<GroupMessage | null>(null);
  const [calendar, setCalendar] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // mientras hay mensajes por salir, se refresca el avance
  const live = items.some((m) => m.status === "sending" || (m.status === "scheduled" && new Date(m.scheduled_at).getTime() < Date.now() + 120_000));
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [live, router]);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = useMemo(() => items
    .filter((m) => (!status || m.status === status) && (!q.trim() || norm(m.name).includes(norm(q.trim()))))
    .sort((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name) : +new Date(a.scheduled_at) - +new Date(b.scheduled_at)) * sort.dir),
  [items, q, status, sort]);

  const toggleSort = (key: "name" | "date") => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const th = "whitespace-nowrap px-5 py-4 text-sm font-semibold uppercase tracking-wide text-slate-700";

  async function remove(ids: string[]) {
    if (!confirm(ids.length === 1 ? "¿Eliminar este mensaje programado? Si aún no salió, no se enviará." : `¿Eliminar ${ids.length} mensajes programados?`)) return;
    setErr(null);
    const { error } = await createClient().rpc("delete_group_messages", { p_ids: ids });
    if (error) return setErr(error.message);
    setPicked(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mensajes programados</h1>
          <p className="text-base text-slate-600">Envía mensajes programados a todos tus grupos y comunidades de WhatsApp de manera automática.</p>
        </div>
        {isAdmin && (
          <Link href="/calendar/new" className="shrink-0 rounded-full bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-700">+ Nuevo mensaje</Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre" value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-md rounded-full border border-slate-300 bg-white px-5 py-3 text-base text-slate-900" />
        <div className="relative flex gap-3" ref={box}>
          <button onClick={() => setMenu(menu === "cols" ? null : "cols")} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-base shadow-sm">▥ Columnas</button>
          <button onClick={() => setMenu(menu === "filter" ? null : "filter")} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-base shadow-sm">⏷ Filtrar</button>
          <button onClick={() => setCalendar((v) => !v)} aria-pressed={calendar} aria-label="Vista de calendario" title={calendar ? "Ver tabla" : "Ver calendario"}
            className={`rounded-full border border-slate-300 px-4 py-3 text-base shadow-sm ${calendar ? "bg-slate-900 text-white" : "bg-white"}`}>🗓</button>
          {menu === "cols" && (
            <ul className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white py-2 shadow-lg">
              {COLS.map((c) => (
                <li key={c.key}><label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={cols[c.key]} onChange={() => setCols({ ...cols, [c.key]: !cols[c.key] })} /> {c.label}</label></li>
              ))}
            </ul>
          )}
          {menu === "filter" && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white p-4 shadow-lg">
              <label className="block text-xs text-slate-600">Estado
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Todos</option>
                  {(Object.keys(STATUS) as St[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
              </label>
              {status && <button onClick={() => setStatus("")} className="mt-3 text-sm text-indigo-600 hover:underline">Limpiar filtro</button>}
            </div>
          )}
        </div>
      </div>

      {err && <p className="mb-3 text-sm text-red-600" role="alert">{err}</p>}
      {isAdmin && picked.size > 0 && !calendar && (
        <div className="mb-3 flex items-center gap-4 text-sm">
          <span>{picked.size} seleccionados</span>
          <button onClick={() => remove([...picked])} className="rounded-full border px-4 py-1.5 text-red-600 hover:bg-red-50">Eliminar</button>
        </div>
      )}

      {calendar ? <Month items={rows} onOpen={setView} /> : (
        <div className="scroll-x max-h-[calc(100vh-17rem)] rounded-2xl border border-slate-300 bg-white">
          <table className="w-full min-w-[900px] text-left text-base text-slate-900">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="w-12 px-5 py-4"><input type="checkbox" aria-label="Seleccionar todos" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                <th className={th}><button onClick={() => toggleSort("name")} className="uppercase">Nombre ⇅</button></th>
                {cols.date && <th className={th}><button onClick={() => toggleSort("date")} className="uppercase">Fecha para envío ⇅</button></th>}
                {cols.read && <th className={th}><span title="Porcentaje de destinatarios que leyeron el mensaje">Tasa de lectura ⓘ</span></th>}
                {cols.status && <th className={th}>Estado</th>}
                <th className="w-32 px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-base text-slate-600">
                  {items.length === 0 ? "Aún no hay mensajes programados." : "Ningún mensaje coincide con los filtros."}
                </td></tr>
              )}
              {rows.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-5 py-4"><input type="checkbox" aria-label={`Seleccionar ${m.name}`} checked={picked.has(m.id)}
                    onChange={() => setPicked((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} /></td>
                  <td className="px-5 py-4 font-semibold"><span className="block max-w-[420px] truncate" title={m.name}>{m.name}</span></td>
                  {cols.date && <td className="whitespace-nowrap px-5 py-4 text-slate-700">{fmt(m.scheduled_at)}</td>}
                  {cols.read && <td className="px-5 py-3"><Ring value={m.read_rate} /></td>}
                  {cols.status && <td className="px-5 py-4"><span className={`rounded-md px-3 py-1 text-base font-medium ${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span></td>}
                  <td className="whitespace-nowrap px-5 py-4 text-right text-slate-600">
                    <button aria-label={`Ver ${m.name}`} title="Ver" className="mr-4 hover:text-slate-900" onClick={() => setView(m)}>👁</button>
                    {isAdmin && <button aria-label={`Eliminar ${m.name}`} title="Eliminar" className="hover:text-red-600" onClick={() => remove([m.id])}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onMouseDown={() => setView(null)}>
          <div role="dialog" aria-modal="true" aria-label={view.name} onMouseDown={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-semibold">{view.name}</h2><p className="text-sm text-slate-600">{fmt(view.scheduled_at)} · {STATUS[view.status].label}</p></div>
              <button onClick={() => setView(null)} aria-label="Cerrar">✕</button>
            </div>
            <ul className="mb-5 space-y-2">
              {(view.blocks?.length ? view.blocks : [{ type: "text", text: view.message }]).map((b, i) => (
                <li key={i} className="whitespace-pre-wrap rounded-xl bg-slate-100 px-4 py-3 text-base">
                  {b.type === "poll" ? `📋 ${b.poll?.question ?? ""}` : b.type === "contact" ? `👤 ${b.contact?.name ?? ""}` : [b.media_name && `📎 ${b.media_name}`, b.text].filter(Boolean).join("\n") || `[${b.type}]`}
                </li>
              ))}
            </ul>
            <p className="mb-2 text-sm font-semibold">Destinos · {view.sent} enviados · {view.failed} fallidos · {view.total} en total</p>
            <ul className="space-y-1.5">
              {view.targets.map((t, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{t.group?.name ?? "Grupo eliminado"}</span>
                  <span className={t.status === "sent" ? "text-green-700" : t.status === "failed" ? "text-red-600" : "text-slate-500"} title={t.error ?? ""}>
                    {t.status === "sent" ? "Enviado" : t.status === "failed" ? "Falló" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
