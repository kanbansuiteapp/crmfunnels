"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Broadcast = {
  id: string; name: string; message: string; status: "draft" | "sending" | "done" | "cancelled";
  per_minute: number; total: number; sent: number; failed: number; created_at: string; started_at: string | null; scheduled_at: string | null;
  channel: { name: string } | null; tag: { name: string } | null;
};

type StateKey = "scheduled" | "draft" | "sending" | "done" | "partial" | "failed" | "cancelled";

const STATE: Record<StateKey, { label: string; cls: string }> = {
  scheduled: { label: "Programado", cls: "bg-indigo-100 text-indigo-700" },
  draft: { label: "Borrador", cls: "bg-slate-100 text-slate-700" },
  sending: { label: "Enviando", cls: "bg-amber-100 text-amber-800" },
  done: { label: "Finalizado", cls: "bg-green-100 text-green-700" },
  partial: { label: "Parcialmente fallido", cls: "bg-red-100 text-red-700" },
  failed: { label: "Fallida", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelada", cls: "bg-slate-200 text-slate-700" },
};

function stateOf(b: Broadcast): StateKey {
  if (b.status === "sending" && b.scheduled_at && new Date(b.scheduled_at) > new Date()) return "scheduled";
  if (b.status === "done" && b.failed > 0) return b.sent > 0 ? "partial" : "failed";
  return b.status;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function fmt(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");
  return `${date}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

export function BroadcastsClient({ items, isAdmin }: { items: Broadcast[]; isAdmin: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StateKey | "">("");
  const [channel, setChannel] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const filterBox = useRef<HTMLDivElement>(null);

  // mientras hay envíos en curso, se refresca el progreso
  const active = items.some((b) => b.status === "sending");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [active, router]);

  useEffect(() => {
    const close = (e: MouseEvent) => filterBox.current && !filterBox.current.contains(e.target as Node) && setFilterOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = useMemo(() => {
    const s = norm(q.trim());
    return items.filter((b) =>
      (!s || norm(b.name).includes(s)) && (!status || stateOf(b) === status) && (!channel || b.channel?.name === channel));
  }, [items, q, status, channel]);

  const hasFilters = !!(q || status || channel);
  const channelNames = [...new Set(items.map((b) => b.channel?.name).filter(Boolean))] as string[];

  async function call(fn: string, args: Record<string, unknown>) {
    const { data, error } = await createClient().rpc(fn, args);
    if (error) setMsg(error.message);
    else router.refresh();
    return { data, error };
  }

  function start(b: Broadcast) {
    const mins = Math.ceil(b.total / b.per_minute);
    if (confirm(`Se enviará "${b.name}" a ${b.total} contactos (≈ ${mins} min a ${b.per_minute}/min). ¿Empezar ahora?`)) {
      call("start_broadcast", { p_id: b.id });
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Envíos masivos a contactos</h1>
          <p className="text-sm text-slate-500">Envía mensajes a todos tus contactos de forma segmentada.</p>
        </div>
        {isAdmin && (
          <Link href="/broadcasts/new"
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
            + Crear envío masivo
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre" value={q}
          onChange={(e) => setQ(e.target.value)} className="w-full max-w-xs rounded-lg border bg-white px-3 py-2 text-sm" />
        <div className="relative flex items-center gap-3" ref={filterBox}>
          {hasFilters && (
            <button onClick={() => { setQ(""); setStatus(""); setChannel(""); }}
              className="text-sm font-medium text-indigo-600 hover:underline">Limpiar todos los filtros</button>
          )}
          <button onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen}
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50">Filtrar</button>
          {filterOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-64 space-y-3 rounded-xl border bg-white p-4 shadow-lg">
              <label className="block text-xs text-slate-600">Estado
                <select value={status} onChange={(e) => setStatus(e.target.value as StateKey | "")} className={`${input} mt-1`}>
                  <option value="">Todos</option>
                  {(Object.keys(STATE) as StateKey[]).map((k) => <option key={k} value={k}>{STATE[k].label}</option>)}
                </select>
              </label>
              <label className="block text-xs text-slate-600">Dispositivo
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`${input} mt-1`}>
                  <option value="">Todos</option>
                  {channelNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {msg && <p className="mb-3 text-sm text-red-600" role="alert">{msg}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-slate-800">
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Dispositivo</th>
              <th className="px-4 py-3 font-semibold">Fecha para envío</th>
              <th className="px-4 py-3 font-semibold">Contactos</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-slate-500">
                  {items.length === 0 ? "Aún no hay envíos masivos." : "Ningún envío coincide con los filtros."}
                </td>
              </tr>
            )}
            {rows.map((b) => {
              const st = STATE[stateOf(b)];
              return (
                <tr key={b.id} className="border-b last:border-0 text-slate-600">
                  <td className="max-w-[260px] truncate px-4 py-4 font-medium" title={b.name}>{b.name}</td>
                  <td className="px-4 py-4"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500" />{b.channel?.name}</td>
                  <td className="px-4 py-4">{fmt(b.scheduled_at ?? b.started_at ?? b.created_at)}</td>
                  <td className="px-4 py-4">{b.total}</td>
                  <td className="px-4 py-4"><span className={`rounded px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                  {isAdmin && (
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      {b.status === "draft" && (
                        <button onClick={() => start(b)} className="mr-2 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white">Iniciar</button>
                      )}
                      {(b.status === "draft" || b.status === "sending") && (
                        <button onClick={() => confirm("¿Cancelar este envío?") && call("cancel_broadcast", { p_id: b.id })}
                          className="rounded-lg border px-3 py-1 text-xs">Cancelar</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
