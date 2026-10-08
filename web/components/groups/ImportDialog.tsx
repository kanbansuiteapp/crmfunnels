"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Device = { id: string; name: string; phone: string; status: string };
type Kind = "group" | "community" | "channel";
type Item = { jid: string; name: string; participants: number; imported: boolean };

const KINDS: { v: Kind; label: string }[] = [{ v: "group", label: "Grupos" }, { v: "community", label: "Comunidades" }, { v: "channel", label: "Canales" }];
const isOn = (d: Device) => d.status === "connected" || d.status === "open";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ImportDialog({ devices, onClose }: { devices: Device[]; onClose: () => void }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<Kind>("group");
  const [q, setQ] = useState("");
  const [device, setDevice] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [gq, setGq] = useState("");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const shown = devices.filter((d) => norm(`${d.name} ${d.phone}`).includes(norm(q.trim())));
  const groups = (items ?? []).filter((g) => norm(g.name).includes(norm(gq.trim())));

  async function next() {
    setStep(2);
    setItems(null);
    setErr(null);
    setNote(null);
    setPicked(new Set());
    const { data, error } = await supabase.functions.invoke("groups-import", { body: { action: "list", channel_id: device, type: kind } });
    if (error || data?.error) { setItems([]); return setErr(data?.error ?? "No se pudieron cargar los grupos."); }
    setItems(data.items as Item[]);
    setNote(data.note ?? null);
    setOpen(true);
  }

  async function run() {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("groups-import", {
      body: { action: "import", channel_id: device, items: [...picked].map((jid) => ({ jid })) },
    });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? "No se pudo importar.");
    router.refresh();
    onClose();
  }

  const toggle = (jid: string) => setPicked((p) => { const n = new Set(p); n.has(jid) ? n.delete(jid) : n.add(jid); return n; });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={step === 1 ? "Seleccionar número" : "Seleccionar grupos"}
        onMouseDown={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{step === 1 ? "Seleccionar número" : "Seleccionar grupos"}</h2>
            <p className="text-sm text-slate-500">{step === 1 ? "Selecciona el número de WhatsApp para importar grupos" : "Selecciona los grupos que deseas importar"}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-900">✕</button>
        </div>

        {step === 1 && (
          <>
            <p className="mb-2 text-sm font-medium">Tipo</p>
            <div className="mb-4 flex flex-wrap gap-3" role="radiogroup" aria-label="Tipo">
              {KINDS.map((k) => (
                <button key={k.v} role="radio" aria-checked={kind === k.v} onClick={() => setKind(k.v)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${kind === k.v ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${kind === k.v ? "border-slate-900" : ""}`}>
                    {kind === k.v && <span className="h-2 w-2 rounded-full bg-slate-900" />}
                  </span>
                  {k.label}
                </button>
              ))}
            </div>
            <input type="search" aria-label="Buscar por nombre o número" placeholder="Buscar por nombre o número..." value={q} onChange={(e) => setQ(e.target.value)}
              className="mb-3 w-full rounded-full border px-5 py-3 text-sm" />
            <ul className="mb-4 max-h-80 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Número">
              {shown.length === 0 && <li className="py-6 text-center text-sm text-slate-500">{devices.length === 0 ? "No tienes números conectados." : "Ningún número coincide."}</li>}
              {shown.map((d) => (
                <li key={d.id}>
                  <button role="radio" aria-checked={device === d.id} onClick={() => setDevice(d.id)}
                    className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left ${device === d.id ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${device === d.id ? "border-slate-900" : ""}`}>
                      {device === d.id && <span className="h-2 w-2 rounded-full bg-slate-900" />}
                    </span>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-slate-100 text-sm font-medium text-slate-500">{d.name.slice(0, 2)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{d.name}</span>
                      <span className="block text-sm text-slate-500">{d.phone || "Sin número"}</span>
                    </span>
                    <span className={`rounded-md px-3 py-1 text-xs font-medium ${isOn(d) ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                      {isOn(d) ? "Conectado" : "Desconectado"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button disabled={!device} onClick={next} className="w-full rounded-full bg-slate-900 py-3.5 text-sm font-medium text-white disabled:opacity-50">Continuar ›</button>
          </>
        )}

        {step === 2 && (
          <>
            <label htmlFor="gsearch" className="mb-2 block text-sm font-semibold">Seleccionar grupos</label>
            <div className="relative">
              <input id="gsearch" autoComplete="off" placeholder="Buscar grupos..." value={gq} onFocus={() => setOpen(true)}
                onChange={(e) => { setGq(e.target.value); setOpen(true); }}
                className="w-full rounded-full border border-indigo-400 px-5 py-3 pr-12 text-sm outline-none" />
              <button type="button" aria-label="Abrir lista" onClick={() => setOpen((v) => !v)} className="absolute right-4 top-3 text-slate-500">⌄</button>
              {open && (
                <ul role="listbox" aria-multiselectable className="absolute z-10 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border bg-white py-1 shadow-lg">
                  {items === null && <li className="px-4 py-4 text-center text-sm text-slate-500">Cargando...</li>}
                  {items !== null && groups.length === 0 && (
                    <li className="px-4 py-4 text-center text-sm text-slate-500">{note ?? (items.length === 0 ? "Este número no tiene registros de este tipo." : "Sin resultados.")}</li>
                  )}
                  {groups.map((g) => (
                    <li key={g.jid} role="option" aria-selected={picked.has(g.jid)}>
                      <button type="button" disabled={g.imported} onClick={() => toggle(g.jid)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
                        <input type="checkbox" readOnly checked={picked.has(g.jid) || g.imported} />
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        <span className="text-xs text-slate-400">{g.imported ? "Ya importado" : `${g.participants} part.`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {picked.size > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {(items ?? []).filter((g) => picked.has(g.jid)).map((g) => (
                  <li key={g.jid} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
                    <span className="max-w-[200px] truncate">{g.name}</span>
                    <button aria-label={`Quitar ${g.name}`} onClick={() => toggle(g.jid)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
            <div className="mt-6 flex gap-3">
              <button onClick={() => setStep(1)} className="rounded-full border px-6 py-3 text-sm">Atrás</button>
              <button disabled={busy || picked.size === 0} onClick={run} className="flex-1 rounded-full bg-slate-900 py-3 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Importando…" : `Importar${picked.size ? ` (${picked.size})` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
