"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PhonePreview } from "@/components/whalinks/WhalinkForm";

type Device = { id: string; name: string; phone: string; status: string };
type Mode = "any" | "all" | "exclude";
const MODES: { v: Mode; title: string; sub: string }[] = [
  { v: "any", title: "Contiene algunos", sub: "Contactos con al menos uno de los tags seleccionados" },
  { v: "all", title: "Contiene todos", sub: "Contactos que tengan todos los tags seleccionados" },
  { v: "exclude", title: "Excluir público", sub: "Contactos que NO tengan ninguno de los tags seleccionados" },
];
// prefijo telefónico → país
const COUNTRIES: [string, string][] = [
  ["57", "Colombia"], ["52", "México"], ["54", "Argentina"], ["56", "Chile"], ["51", "Perú"], ["593", "Ecuador"],
  ["58", "Venezuela"], ["591", "Bolivia"], ["595", "Paraguay"], ["598", "Uruguay"], ["506", "Costa Rica"], ["507", "Panamá"],
  ["502", "Guatemala"], ["503", "El Salvador"], ["504", "Honduras"], ["505", "Nicaragua"], ["53", "Cuba"], ["34", "España"],
  ["55", "Brasil"], ["1", "Estados Unidos / Canadá"],
];
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

export function BroadcastWizard({ devices, tags, orgId }: { devices: Device[]; tags: { id: string; name: string }[]; orgId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: "", channel: "", message: "", when: "now" as "now" | "later", at: "", perMinute: 6,
  });
  const [aud, setAud] = useState<{ tags: string[]; mode: Mode; countries: string[] }>({ tags: [], mode: "any", countries: [] });
  const [adding, setAdding] = useState<null | "menu" | "tags" | "country">(null);
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<{ path: string; name: string; mime: string; preview: string } | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const imgIn = useRef<HTMLInputElement>(null);
  const vidIn = useRef<HTMLInputElement>(null);
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
    supabase.rpc("count_audience", { p_tags: aud.tags, p_mode: aud.mode, p_codes: aud.countries })
      .then(({ data }) => live && setCount((data as number | null) ?? 0));
    return () => { live = false; };
  }, [aud, supabase]);

  async function pickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) return setErr("El archivo supera 16 MB.");
    setUpBusy(true);
    setErr(null);
    const mime = (file.type || "application/octet-stream").split(";")[0];
    const path = `${orgId}/broadcasts/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: mime });
    setUpBusy(false);
    if (error) return setErr(`No se pudo subir: ${error.message}`);
    if (media) supabase.storage.from("chat-media").remove([media.path]);
    setMedia({ path, name: file.name, mime, preview: URL.createObjectURL(file) });
  }

  function removeMedia() {
    if (media) supabase.storage.from("chat-media").remove([media.path]); // no dejar archivos huérfanos
    setMedia(null);
  }

  // envuelve la selección con marcas de WhatsApp (*negrita*, _cursiva_, ~tachado~) o inserta texto en el cursor
  function wrap(mark: string) {
    const el = ta.current;
    if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const sel = f.message.slice(a, b);
    const next = f.message.slice(0, a) + mark + sel + mark + f.message.slice(b);
    if (next.length > 4000) return;
    setF({ ...f, message: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + mark.length, b + mark.length); });
  }
  function insert(text: string) {
    const el = ta.current;
    const a = el?.selectionStart ?? f.message.length;
    const b = el?.selectionEnd ?? a;
    const next = f.message.slice(0, a) + text + f.message.slice(b);
    if (next.length > 4000) return;
    setF({ ...f, message: next });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + text.length, a + text.length); });
  }

  const valid = [
    f.name.trim() && f.channel && (f.message.trim() || media),
    count !== 0,
    f.when === "now" || (f.at && new Date(f.at).getTime() > Date.now()),
  ];

  async function create() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("create_broadcast_audience", {
      p_name: f.name, p_channel: f.channel, p_message: f.message, p_tags: aud.tags, p_mode: aud.mode, p_codes: aud.countries,
      p_per_minute: f.perMinute, p_scheduled_at: f.when === "later" ? new Date(f.at).toISOString() : null,
      p_media_path: media?.path ?? null, p_media_name: media?.name ?? null, p_media_mime: media?.mime ?? null,
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

      <div>
        {step === 1 && (
          <div className="mb-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4 rounded-xl border bg-white px-5 py-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-500 text-xl text-white" aria-hidden>👤</span>
                <div>
                  <p className="text-sm">Envío masivo a:</p>
                  <p><span className="text-2xl font-semibold">{count ?? "…"}</span> <span className="text-sm text-slate-500">Contactos</span></p>
                </div>
              </div>
              <div className="relative">
                <button type="button" onClick={() => setAdding(adding ? null : "menu")}
                  className="rounded-lg bg-indigo-500 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-600">⏷ Añadir filtro</button>
                {adding === "menu" && (
                  <ul className="absolute right-0 z-20 mt-2 w-56 rounded-xl border bg-white py-2 shadow-lg">
                    <li><button type="button" onClick={() => setAdding("tags")} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">🏷️ Filtros por Tags</button></li>
                    <li><button type="button" onClick={() => setAdding("country")} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50">🌐 Filtro por País</button></li>
                  </ul>
                )}
              </div>
            </div>

            {(adding === "tags" || aud.tags.length > 0) && (
              <section className="mb-4 rounded-xl border bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Filtros por Tags</h3>
                  <button type="button" onClick={() => { setAud({ ...aud, tags: [], mode: "any" }); setAdding(null); }} className="text-sm text-indigo-600 hover:underline">Quitar</button>
                </div>
                <div className="mb-4 grid gap-2 md:grid-cols-3">
                  {MODES.map((m) => (
                    <label key={m.v} className={`cursor-pointer rounded-lg border p-3 text-sm ${aud.mode === m.v ? "border-indigo-500 bg-indigo-50" : ""}`}>
                      <input type="radio" name="mode" className="mr-2" checked={aud.mode === m.v} onChange={() => setAud({ ...aud, mode: m.v })} />
                      <b>{m.title}</b><span className="mt-1 block text-xs text-slate-500">{m.sub}</span>
                    </label>
                  ))}
                </div>
                {tags.length === 0 && <p className="text-sm text-slate-500">Aún no tienes tags.</p>}
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const on = aud.tags.includes(t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={on}
                        onClick={() => setAud({ ...aud, tags: on ? aud.tags.filter((x) => x !== t.id) : [...aud.tags, t.id] })}
                        className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-500 bg-indigo-500 text-white" : "hover:bg-slate-50"}`}>{t.name}</button>
                    );
                  })}
                </div>
              </section>
            )}

            {(adding === "country" || aud.countries.length > 0) && (
              <section className="mb-4 rounded-xl border bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Filtro por País</h3>
                  <button type="button" onClick={() => { setAud({ ...aud, countries: [] }); setAdding(null); }} className="text-sm text-indigo-600 hover:underline">Quitar</button>
                </div>
                <p className="mb-3 text-sm text-slate-500">Selecciona uno o varios países según el prefijo del teléfono.</p>
                <div className="flex flex-wrap gap-2">
                  {COUNTRIES.map(([code, name]) => {
                    const on = aud.countries.includes(code);
                    return (
                      <button key={code} type="button" aria-pressed={on}
                        onClick={() => setAud({ ...aud, countries: on ? aud.countries.filter((x) => x !== code) : [...aud.countries, code] })}
                        className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-500 bg-indigo-500 text-white" : "hover:bg-slate-50"}`}>{name} (+{code})</button>
                    );
                  })}
                </div>
              </section>
            )}

            {aud.tags.length === 0 && aud.countries.length === 0 && adding !== "tags" && adding !== "country" && (
              <div className="mx-auto mt-10 max-w-3xl rounded-3xl border bg-slate-50 p-8">
                <div className="mb-6 flex items-center gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-500 text-2xl text-white" aria-hidden>⏷</span>
                  <div>
                    <h3 className="text-xl font-semibold">Crea tu audiencia segmentada</h3>
                    <p className="text-slate-500">Agrega filtros para definir quién recibirá tu envío masivo</p>
                  </div>
                </div>
                <div className="mb-4 rounded-xl border bg-white p-5">
                  <p className="font-semibold">🏷️ Filtros por Tags</p>
                  <p className="mt-1 text-sm text-slate-500">Selecciona tags y elige cómo aplicarlos:</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {MODES.map((m) => <li key={m.v}><span className="text-indigo-500">✓</span> <b>{m.title}:</b> <span className="text-slate-500">{m.sub}</span></li>)}
                  </ul>
                </div>
                <div className="rounded-xl border bg-white p-5">
                  <p className="font-semibold">🌐 Filtro por País</p>
                  <p className="mt-1 text-sm text-slate-500">Selecciona uno o varios países para segmentar tu audiencia por ubicación geográfica.</p>
                </div>
              </div>
            )}
            {count === 0 && <p className="mt-4 text-sm text-red-600" role="alert">Ningún contacto cumple los filtros.</p>}
          </div>
        )}
      <div className={step === 1 ? "" : "grid gap-8 lg:grid-cols-2"}>
        <div className="space-y-5">
          {step === 0 && (
            <>
              <input aria-label="Nombre del envío masivo" placeholder="Nombre del envío masivo" value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
              <div className="relative" ref={box}>
                <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
                  className={`${input} flex items-center justify-between text-left ${device ? "" : "text-slate-400"}`}>
                  <span className="flex items-center gap-3">
                    {device && <span className={`h-3 w-3 rounded-full ${isOn(device) ? "bg-green-500" : "bg-slate-400"}`} />}
                    {device ? label4(device) : "Seleccionar dispositivo"}
                  </span>
                  <span className="flex items-center gap-3 text-slate-400">
                    {device && <span role="button" aria-label="Quitar dispositivo" onClick={(e) => { e.stopPropagation(); setF({ ...f, channel: "" }); }}>✕</span>}
                    <span aria-hidden>⌄</span>
                  </span>
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
              <div className="flex items-center gap-8 text-sm">
                <label className="flex cursor-not-allowed items-center gap-2 text-slate-400" title="Aún no hay plantillas guardadas">
                  <input type="radio" name="kind" disabled /> Plantilla
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="kind" checked readOnly className="accent-indigo-600" /> Crear un mensaje
                </label>
              </div>
              <p className="border-t pt-4 text-center text-sm text-slate-500">Crea un nuevo mensaje</p>
              <p className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                Evita enviar difusiones masivas a contactos que podrían considerar el mensaje como spam, para evitar que WhatsApp bloquee tu número.
              </p>

              <input ref={imgIn} type="file" accept="image/*" hidden onChange={pickMedia} />
              <input ref={vidIn} type="file" accept="video/*" hidden onChange={pickMedia} />
              {media ? (
                <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border-2 border-dotted border-indigo-300 px-4 py-3 text-sm">
                  <span className="truncate" title={media.name}>{media.mime.startsWith("video") ? "🎞️" : "🖼️"} {media.name}</span>
                  <button type="button" onClick={removeMedia} className="shrink-0 text-indigo-600 hover:underline">Quitar</button>
                </div>
              ) : (
                <div className="mx-auto grid w-full max-w-sm grid-cols-2 overflow-hidden rounded-2xl border-2 border-dotted border-indigo-400 text-sm font-medium text-indigo-600">
                  <button type="button" disabled={upBusy} onClick={() => imgIn.current?.click()} className="border-r-2 border-dotted border-indigo-400 py-5 hover:bg-indigo-50 disabled:opacity-50">
                    <span className="block text-2xl" aria-hidden>🖼️</span>{upBusy ? "Subiendo…" : "Imagen"}
                  </button>
                  <button type="button" disabled={upBusy} onClick={() => vidIn.current?.click()} className="py-5 hover:bg-indigo-50 disabled:opacity-50">
                    <span className="block text-2xl" aria-hidden>🎞️</span>Video
                  </button>
                </div>
              )}

              <div className="rounded-xl bg-slate-100 p-4">
                <textarea ref={ta} aria-label="Mensaje" rows={6} maxLength={4000} value={f.message}
                  onChange={(e) => setF({ ...f, message: e.target.value })}
                  placeholder="Escribe tu mensaje. Usa {{name}} para el nombre del contacto."
                  className="w-full resize-none bg-transparent text-sm outline-none" />
                <div className="relative mt-2 flex items-center justify-between text-slate-500">
                  <div className="flex items-center gap-4">
                    <button type="button" aria-label="Emoji" onClick={() => setEmojis((v) => !v)}>☺</button>
                    <button type="button" aria-label="Negrita" onClick={() => wrap("*")} className="font-bold">B</button>
                    <button type="button" aria-label="Cursiva" onClick={() => wrap("_")} className="italic">I</button>
                    <button type="button" aria-label="Tachado" onClick={() => wrap("~")} className="line-through">S</button>
                    <button type="button" aria-label="Insertar nombre del contacto" title="Insertar {{name}}" onClick={() => insert("{{name}}")}>{"{}"}</button>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs">{f.message.length} / 4000</span>
                  {emojis && (
                    <div className="absolute bottom-full left-0 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl border bg-white p-2 text-lg shadow-lg">
                      {["😀", "😊", "😉", "😍", "🙏", "👍", "👋", "🎉", "🔥", "✅", "⭐", "💬", "📞", "🎁", "💡", "❤️", "😂", "🤝", "🚀", "📣", "⏰", "💰", "📦", "✨"].map((em) => (
                        <button key={em} type="button" onClick={() => { insert(em); setEmojis(false); }}>{em}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <p className="text-sm text-slate-500">
              Define quién recibirá el envío con los filtros de la derecha. Quienes hayan respondido STOP, baja o cancelar quedan excluidos.
            </p>
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

        {step !== 1 && (
          <div className="rounded-2xl bg-slate-50 p-8">
            <PhonePreview device={device && device.phone ? device : undefined} message={f.message} media={media ? { url: media.preview, video: media.mime.startsWith("video") } : undefined} />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
