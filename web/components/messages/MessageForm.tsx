"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Target = { id: string; name: string; type: "group" | "community" | "channel"; participants: number };

const field = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500";
const lbl = "mb-1.5 block text-sm font-semibold text-slate-800";
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MessageForm({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"group" | "community">("group");
  const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(() => localInput(new Date(Date.now() + 3_600_000)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const list = targets.filter((t) => t.type === kind && norm(t.name).includes(norm(q.trim())));
  const allOn = list.length > 0 && list.every((t) => ids.includes(t.id));

  function wrap(mark: string) {
    const el = ta.current;
    if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const next = message.slice(0, a) + mark + message.slice(a, b) + mark + message.slice(b);
    if (next.length > 4000) return;
    setMessage(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + mark.length, b + mark.length); });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (new Date(at).getTime() <= Date.now()) return setErr("Elige una fecha y hora futuras.");
    setBusy(true);
    const { error } = await supabase.rpc("create_group_message", { p_name: name, p_message: message, p_group_ids: ids, p_at: new Date(at).toISOString() });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/calendar");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-4xl pb-28">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/calendar" aria-label="Volver" className="text-2xl text-slate-700 hover:text-slate-900">←</Link>
        <h1 className="text-3xl font-bold text-slate-900">Nuevo mensaje</h1>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-300 bg-white p-6">
          <label htmlFor="mname" className={lbl}>Nombre *</label>
          <input id="mname" required maxLength={100} placeholder="Ej: Aviso de la clase de hoy" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <label htmlFor="mmsg" className={`${lbl} mt-5`}>Mensaje *</label>
          <div className="rounded-xl bg-slate-100 p-4">
            <textarea id="mmsg" ref={ta} required rows={7} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe el mensaje que se enviará a los grupos…" className="w-full resize-none bg-transparent text-base text-slate-900 outline-none" />
            <div className="mt-2 flex items-center justify-between text-slate-600">
              <div className="flex gap-4">
                <button type="button" aria-label="Negrita" onClick={() => wrap("*")} className="font-bold">B</button>
                <button type="button" aria-label="Cursiva" onClick={() => wrap("_")} className="italic">I</button>
                <button type="button" aria-label="Tachado" onClick={() => wrap("~")} className="line-through">S</button>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs">{message.length} / 4000</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-300 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Destinos *</h2>
          <div className="mb-4 flex gap-3" role="radiogroup" aria-label="Tipo de destino">
            {(["group", "community"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setIds([]); }}
                className={`rounded-full border px-5 py-2.5 text-base ${kind === k ? "border-slate-900 bg-slate-100 font-semibold" : "border-slate-300 hover:bg-slate-50"}`}>
                {k === "group" ? "Grupos" : "Comunidades"}
              </button>
            ))}
          </div>
          <input type="search" aria-label="Buscar" placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} className={`${field} mb-3`} />
          <label className="mb-2 flex cursor-pointer items-center gap-3 px-3 text-sm font-medium">
            <input type="checkbox" checked={allOn} disabled={list.length === 0}
              onChange={() => setIds(allOn ? ids.filter((i) => !list.some((t) => t.id === i)) : [...new Set([...ids, ...list.map((t) => t.id)])])} />
            Seleccionar todos ({list.length})
          </label>
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border p-1">
            {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-600">
              {targets.some((t) => t.type === kind) ? "Sin resultados." : "Primero importa grupos o comunidades en la sección Grupos y comunidades."}
            </li>}
            {list.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-base hover:bg-slate-50">
                  <input type="checkbox" checked={ids.includes(t.id)} onChange={() => setIds(ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id])} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span><span className="text-sm text-slate-500">{t.participants} part.</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-slate-600">{ids.length} seleccionados</p>
        </section>

        <section className="rounded-2xl border border-slate-300 bg-white p-6">
          <label htmlFor="mat" className={lbl}>Fecha y hora de envío *</label>
          <input id="mat" type="datetime-local" required min={localInput(new Date())} value={at} onChange={(e) => setAt(e.target.value)} className={`${field} max-w-xs`} />
          <p className="mt-2 text-sm text-slate-600">El mensaje sale a esa hora, con una pequeña pausa entre un grupo y otro.</p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-5 py-4 backdrop-blur md:left-[4.5rem]">
        {err && <p className="mb-2 text-right text-sm text-red-600" role="alert">{err}</p>}
        <div className="flex items-center justify-end gap-4">
          <Link href="/calendar" className="rounded-full px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">Cancelar</Link>
          <button disabled={busy || ids.length === 0} className="rounded-full bg-slate-900 px-7 py-3 text-base font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {busy ? "Programando…" : "Programar mensaje"}
          </button>
        </div>
      </div>
    </form>
  );
}
