"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Broadcast = {
  id: string; name: string; message: string; status: "draft" | "sending" | "done" | "cancelled";
  per_minute: number; total: number; sent: number; failed: number; created_at: string;
  channel: { name: string } | null; tag: { name: string } | null;
};

const STATUS: Record<Broadcast["status"], { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-slate-100 text-slate-700" },
  sending: { label: "Enviando", cls: "bg-amber-100 text-amber-800" },
  done: { label: "Completada", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelada", cls: "bg-red-100 text-red-800" },
};

export function BroadcastsClient({
  items, channels, tags, isAdmin,
}: {
  items: Broadcast[]; channels: { id: string; name: string }[]; tags: { id: string; name: string }[]; isAdmin: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", channel: channels[0]?.id ?? "", message: "", tag: "", perMinute: 6 });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // mientras hay campañas enviándose, se refresca el progreso
  const active = items.some((b) => b.status === "sending");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [active, router]);

  async function call(fn: string, args: Record<string, unknown>) {
    const { data, error } = await createClient().rpc(fn, args);
    if (error) setMsg(error.message);
    else router.refresh();
    return { data, error };
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await call("create_broadcast", {
      p_name: f.name, p_channel: f.channel, p_message: f.message, p_tag: f.tag || null, p_per_minute: f.perMinute,
    });
    setBusy(false);
    if (!error) setF({ ...f, name: "", message: "" });
  }

  function start(b: Broadcast) {
    const mins = Math.ceil(b.total / b.per_minute);
    if (confirm(`Se enviará "${b.name}" a ${b.total} contactos (≈ ${mins} min a ${b.per_minute}/min). ¿Empezar ahora?`)) {
      call("start_broadcast", { p_id: b.id });
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {isAdmin && (
        <form onSubmit={create} className="h-fit space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Nueva campaña</h2>
          <input required placeholder="Nombre interno" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
          <select aria-label="Canal" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className={input}>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Audiencia" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} className={input}>
            <option value="">Todos los contactos</option>
            {tags.map((t) => <option key={t.id} value={t.id}>Etiqueta: {t.name}</option>)}
          </select>
          <textarea required rows={5} maxLength={1000} placeholder="Mensaje. Puedes usar {{name}} para el nombre."
            value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className={input} />
          <label className="block text-xs text-slate-600">
            Velocidad
            <select value={f.perMinute} onChange={(e) => setF({ ...f, perMinute: Number(e.target.value) })} className={`${input} mt-1`}>
              <option value={3}>3 por minuto (muy seguro)</option>
              <option value={6}>6 por minuto (recomendado)</option>
              <option value={12}>12 por minuto</option>
              <option value={20}>20 por minuto (riesgo alto)</option>
            </select>
          </label>
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            WhatsApp puede bloquear números que envían mensajes masivos a quien no los espera. Escribe solo a contactos
            que te han escrito antes. Quien responda <b>STOP</b>, <b>baja</b> o <b>cancelar</b> queda excluido de futuros envíos.
          </p>
          <button disabled={busy || channels.length === 0} className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Crear borrador
          </button>
          <p className="text-xs text-slate-500">La lista de destinatarios se fija al crear el borrador. No se envía nada hasta que pulses "Iniciar".</p>
        </form>
      )}

      <section className={isAdmin ? "" : "lg:col-span-2"}>
        {msg && <p className="mb-3 text-sm text-red-600" role="alert">{msg}</p>}
        <ul className="space-y-3">
          {items.length === 0 && <li className="rounded-xl border bg-white p-6 text-sm text-slate-500">Aún no hay campañas.</li>}
          {items.map((b) => {
            const done = b.sent + b.failed;
            const pct = b.total ? Math.round((done / b.total) * 100) : 0;
            return (
              <li key={b.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-slate-500">
                      {b.channel?.name} · {b.tag ? `etiqueta ${b.tag.name}` : "todos los contactos"} · {b.per_minute}/min
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">“{b.message}”</p>
                <div className="mt-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${b.name}`}>
                  <div className="h-2 rounded bg-slate-100">
                    <div className="h-2 rounded bg-sky-600" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {b.sent} enviados · {b.failed} fallidos · {b.total} destinatarios
                  </p>
                </div>
                {isAdmin && (b.status === "draft" || b.status === "sending") && (
                  <div className="mt-3 flex gap-2">
                    {b.status === "draft" && (
                      <button onClick={() => start(b)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white">Iniciar envío</button>
                    )}
                    <button onClick={() => confirm("¿Cancelar esta campaña?") && call("cancel_broadcast", { p_id: b.id })}
                      className="rounded-lg border px-3 py-1.5 text-xs">Cancelar</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
