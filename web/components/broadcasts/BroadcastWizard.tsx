"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PhonePreview } from "@/components/whalinks/WhalinkForm";

type Device = { id: string; name: string; phone: string; status: string };
const DOTS = ["bg-black", "bg-orange-500", "bg-yellow-400", "bg-blue-500", "bg-slate-500"];
const isOn = (d: Device) => d.status === "connected" || d.status === "open";
const label4 = (d: Device) => `${d.name} (${d.phone ? d.phone.slice(-4) : "****"}) - ${isOn(d) ? "Conectado" : "Desconectado"}`;

const STEPS = [
  { title: "Enviar mensaje", sub: "Selecciona una plantilla o crea un mensaje nuevo" },
  { title: "Seleccionar audiencia", sub: "Selecciona los contactos que recibirán el envío masivo" },
  { title: "Programar envío", sub: "Selecciona una fecha y hora para el envío" },
];

// valor para <input type="datetime-local"> en hora local
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function BroadcastWizard({ devices, tags }: { devices: Device[]; tags: { id: string; name: string }[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: "", channel: "", message: "", tag: "", when: "now" as "now" | "later", at: "", perMinute: 6,
  });
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const device = devices.find((d) => d.id === f.channel);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // contactos que recibirán el envío (excluye a quienes pidieron no ser contactados)
  useEffect(() => {
    let live = true;
    setCount(null);
    const q = f.tag
      ? supabase.from("contact_tags").select("contact_id, contacts!inner(do_not_contact)", { count: "exact", head: true })
          .eq("tag_id", f.tag).eq("contacts.do_not_contact", false)
      : supabase.from("contacts").select("id", { count: "exact", head: true }).eq("do_not_contact", false);
    q.then(({ count: n }) => live && setCount(n ?? 0));
    return () => { live = false; };
  }, [f.tag, supabase]);

  const valid = [
    f.name.trim() && f.channel && f.message.trim(),
    count !== 0,
    f.when === "now" || (f.at && new Date(f.at).getTime() > Date.now()),
  ];

  async function create() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("create_broadcast", {
      p_name: f.name, p_channel: f.channel, p_message: f.message, p_tag: f.tag || null, p_per_minute: f.perMinute,
      p_scheduled_at: f.when === "later" ? new Date(f.at).toISOString() : null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/broadcasts");
    router.refresh();
  }

  const input = "w-full rounded-lg border bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400";
  const label = "mb-2 block text-sm font-semibold";

  return (
    <div>
      <Link href="/broadcasts" className="text-sm font-medium text-indigo-600 hover:underline">← Regresar</Link>
      <h1 className="mb-5 mt-2 text-2xl font-semibold">Crear envío masivo a contactos</h1>

      <ol className="mb-8 grid overflow-hidden rounded-xl border bg-white md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`border-b-4 md:border-r md:last:border-r-0 ${i === step ? "border-b-indigo-500" : "border-b-transparent"}`}>
            <button type="button" onClick={() => i <= step || valid.slice(0, i).every(Boolean) ? setStep(i) : undefined}
              aria-current={i === step ? "step" : undefined} className="flex w-full items-start gap-4 p-5 text-left">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                i === step ? "border-indigo-500 text-indigo-600" : i < step ? "border-indigo-500 bg-indigo-500 text-white" : "border-indigo-300 text-indigo-500"}`}>
                {i < step ? "✓" : String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-sm font-semibold">{s.title}</span>
                <span className="block text-sm text-slate-500">{s.sub}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          {step === 0 && (
            <>
              <input aria-label="Nombre del envío masivo" placeholder="Nombre del envío masivo" value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
              <div className="relative" ref={box}>
                <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
                  className={`${input} flex items-center justify-between text-left ${device ? "" : "text-slate-400"}`}>
                  <span>{device ? label4(device) : "Seleccionar dispositivo"}</span>
                  <span aria-hidden className="text-slate-400">⌄</span>
                </button>
                {open && (
                  <ul role="listbox" aria-label="Dispositivos" className="absolute z-20 mt-1 w-full rounded-lg border bg-white py-2 shadow-lg">
                    {devices.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No tienes dispositivos conectados.</li>}
                    {devices.map((d, i) => (
                      <li key={d.id} role="option" aria-selected={d.id === f.channel}>
                        <button type="button" onClick={() => { setF({ ...f, channel: d.id }); setOpen(false); }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-600 hover:bg-slate-50">
                          <span className={`h-3 w-3 shrink-0 rounded-full ${DOTS[i % DOTS.length]}`} />
                          {label4(d)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {device && !isOn(device) && <p className="text-sm text-amber-700">Este dispositivo está desconectado: los mensajes fallarán hasta que lo reconectes.</p>}
              <div>
                <label htmlFor="msg" className={label}>Mensaje</label>
                <textarea id="msg" rows={7} maxLength={1000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })}
                  placeholder="Escribe tu mensaje. Usa {{name}} para el nombre del contacto." className={input} />
                <p className="mt-1 text-right text-xs text-slate-400">{f.message.length}/1000</p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <label htmlFor="aud" className={label}>Audiencia</label>
                <select id="aud" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} className={input}>
                  <option value="">Todos los contactos</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>Etiqueta: {t.name}</option>)}
                </select>
              </div>
              <p className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
                {count === null ? "Calculando…" : <><b>{count}</b> {count === 1 ? "contacto recibirá" : "contactos recibirán"} este envío.</>}
                {count === 0 && " Ningún contacto cumple el filtro."}
              </p>
              <p className="text-xs text-slate-500">
                Quienes hayan respondido STOP, baja o cancelar quedan excluidos. La lista se fija al crear el envío.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset className="space-y-3">
                <legend className={label}>¿Cuándo enviar?</legend>
                {([["now", "Enviar ahora"], ["later", "Programar fecha y hora"]] as const).map(([v, t]) => (
                  <label key={v} className="flex items-center gap-3 text-sm">
                    <input type="radio" name="when" checked={f.when === v}
                      onChange={() => setF({ ...f, when: v, at: v === "later" && !f.at ? localInput(new Date(Date.now() + 3_600_000)) : f.at })} />
                    {t}
                  </label>
                ))}
              </fieldset>
              {f.when === "later" && (
                <input type="datetime-local" aria-label="Fecha y hora de envío" min={localInput(new Date())} value={f.at}
                  onChange={(e) => setF({ ...f, at: e.target.value })} className={input} />
              )}
              <div>
                <label htmlFor="speed" className={label}>Velocidad</label>
                <select id="speed" value={f.perMinute} onChange={(e) => setF({ ...f, perMinute: Number(e.target.value) })} className={input}>
                  <option value={3}>3 por minuto (muy seguro)</option>
                  <option value={6}>6 por minuto (recomendado)</option>
                  <option value={12}>12 por minuto</option>
                  <option value={20}>20 por minuto (riesgo alto)</option>
                </select>
              </div>
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                WhatsApp puede bloquear números que envían mensajes masivos a quien no los espera. Escribe solo a contactos que te han escrito antes.
              </p>
              <p className="text-sm text-slate-600">
                Resumen: <b>{f.name}</b> · {device?.name} · {count ?? "…"} contactos ·{" "}
                {f.when === "now" ? "se envía ahora" : f.at && new Date(f.at).toLocaleString("es")}
              </p>
            </>
          )}

          {err && <p className="text-sm text-red-600" role="alert">{err}</p>}

          <div className="flex gap-3 pt-2">
            {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="rounded-lg border px-5 py-2.5 text-sm">Atrás</button>}
            {step < 2 ? (
              <button type="button" disabled={!valid[step]} onClick={() => setStep(step + 1)}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">Siguiente</button>
            ) : (
              <button type="button" disabled={busy || !valid.every(Boolean)} onClick={create}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Creando…" : f.when === "now" ? "Crear y enviar" : "Programar envío"}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-8">
          <PhonePreview device={device && device.phone ? device : undefined} message={f.message} />
        </div>
      </div>
    </div>
  );
}
