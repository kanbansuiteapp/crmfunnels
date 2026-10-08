"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Target = { id: string; name: string; type: "group" | "community" | "channel"; participants: number };
export type CampaignOpt = { id: string; name: string; groups: number };

type BType = "text" | "audio" | "document" | "media" | "link" | "poll" | "contact" | "event";
type Block = {
  id: string; type: BType; open: boolean; text: string; mention_all: boolean; pin: boolean; pin_days: 1 | 7 | 30;
  media: { path: string; name: string; mime: string; preview: string } | null;
  url: string; pollQ: string; pollOpts: string[]; pollMulti: boolean; cName: string; cPhone: string;
  evTitle: string; evAt: string; evPlace: string;
};

const TYPES: { v: BType; label: string; icon: string; title: string }[] = [
  { v: "text", label: "Mensaje", icon: "💬", title: "Enviar mensaje" },
  { v: "audio", label: "Audio", icon: "🎙", title: "Enviar audio" },
  { v: "document", label: "Documento", icon: "📄", title: "Enviar documento" },
  { v: "media", label: "Imagen/Video", icon: "🖼", title: "Enviar imagen o video" },
  { v: "link", label: "Link", icon: "🔗", title: "Enviar link" },
  { v: "poll", label: "Encuesta", icon: "📋", title: "Enviar encuesta" },
  { v: "contact", label: "Contacto", icon: "👤", title: "Enviar contacto" },
  { v: "event", label: "Evento", icon: "🗓", title: "Enviar evento" },
];
const MAX_BLOCKS = 3;
const EMOJIS = ["😀", "😊", "😉", "😍", "🙏", "👍", "👋", "🎉", "🔥", "✅", "⭐", "💬", "🎁", "💡", "❤️", "🚀"];

const field = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500";
const lbl = "mb-1.5 block text-base font-semibold text-slate-900";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const two = (n: number) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const newBlock = (type: BType): Block => ({
  id: crypto.randomUUID(), type, open: true, text: "", mention_all: false, pin: false, pin_days: 1, media: null, url: "",
  pollQ: "", pollOpts: ["", ""], pollMulti: false, cName: "", cPhone: "", evTitle: "", evAt: "", evPlace: "",
});

function Radio({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex items-center gap-2.5 text-base text-slate-900">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-slate-900" : "border-slate-300"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />}</span>
      {label}
    </button>
  );
}
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-slate-900" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// selector con búsqueda y selección múltiple
function Multi({ label, placeholder, options, value, onChange }: { label: string; placeholder: string; options: { id: string; name: string; hint?: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const list = options.filter((o) => norm(o.name).includes(norm(q.trim())));
  return (
    <div ref={box} className="relative">
      <label className={lbl}>{label}<span className="text-red-500">*</span></label>
      <div className={`${field} flex cursor-text items-center justify-between rounded-full py-2.5`} onClick={() => setOpen(true)}>
        <input aria-label={label} placeholder={value.length ? `${value.length} seleccionados` : placeholder} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500" />
        <button type="button" aria-label="Abrir lista" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>⌄</button>
      </div>
      {open && (
        <ul role="listbox" aria-multiselectable className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-white py-1 shadow-lg">
          {list.length === 0 && <li className="px-4 py-4 text-center text-sm text-slate-600">{options.length === 0 ? "No hay opciones todavía." : "Sin resultados."}</li>}
          {list.map((o) => {
            const on = value.includes(o.id);
            return (
              <li key={o.id} role="option" aria-selected={on}>
                <button type="button" onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-base hover:bg-slate-50">
                  <input type="checkbox" readOnly checked={on} /><span className="min-w-0 flex-1 truncate">{o.name}</span>{o.hint && <span className="text-sm text-slate-500">{o.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {options.filter((o) => value.includes(o.id)).map((o) => (
            <li key={o.id} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
              <span className="max-w-[220px] truncate">{o.name}</span><button type="button" aria-label={`Quitar ${o.name}`} onClick={() => onChange(value.filter((x) => x !== o.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MessageForm({ orgId, targets, campaigns }: { orgId: string; targets: Target[]; campaigns: CampaignOpt[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<"campaign" | "group">("campaign");
  const [name, setName] = useState("");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [speed, setSpeed] = useState<"fast" | "slow">("fast");
  const [sendNow, setSendNow] = useState(false);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("17:00");
  const [tz, setTz] = useState("America/Bogota");
  const [rep, setRep] = useState({ on: false, frequency: "daily" as "daily" | "weekly" | "monthly", end: "never" as "never" | "after" | "date", after: 4, until: "" });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [drag, setDrag] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const taRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => { try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota"); } catch { /* queda America/Bogota */ } }, []);

  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const move = (id: string, d: -1 | 1) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const dropOn = (overId: string) => {
    if (!drag || drag === overId) return;
    setBlocks((bs) => {
      const from = bs.findIndex((b) => b.id === drag), to = bs.findIndex((b) => b.id === overId);
      if (from < 0 || to < 0) return bs;
      const n = [...bs]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n;
    });
    setDrag(null);
  };

  function wrap(id: string, mark: string) {
    const b = blocks.find((x) => x.id === id), el = taRefs.current[id];
    if (!b || !el) return;
    const [x, y] = [el.selectionStart, el.selectionEnd];
    const next = b.text.slice(0, x) + mark + b.text.slice(x, y) + mark + b.text.slice(y);
    if (next.length > 4096) return;
    patch(id, { text: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(x + mark.length, y + mark.length); });
  }
  function addEmoji(id: string, e: string) {
    const b = blocks.find((x) => x.id === id);
    if (b && b.text.length + e.length <= 4096) patch(id, { text: b.text + e });
    setEmoji(null);
  }

  async function upload(id: string, accept: "audio" | "image" | "any", f: File | undefined) {
    if (!f) return;
    if (accept === "audio" && !f.type.startsWith("audio/")) return setErr("El archivo debe ser un audio.");
    if (accept === "image" && !(f.type.startsWith("image/") || f.type.startsWith("video/"))) return setErr("El archivo debe ser una imagen o un video.");
    if (f.size > 16 * 1024 * 1024) return setErr("El archivo supera 16 MB.");
    setBusy(id);
    setErr(null);
    const mime = (f.type || "application/octet-stream").split(";")[0];
    const path = `${orgId}/group-messages/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, f, { contentType: mime });
    setBusy(null);
    if (error) return setErr(`No se pudo subir el archivo: ${error.message}`);
    const old = blocks.find((b) => b.id === id)?.media;
    if (old) supabase.storage.from("chat-media").remove([old.path]);
    patch(id, { media: { path, name: f.name, mime, preview: URL.createObjectURL(f) } });
  }
  function removeBlock(id: string) {
    const b = blocks.find((x) => x.id === id);
    if (b?.media) supabase.storage.from("chat-media").remove([b.media.path]); // no dejar archivos huérfanos
    setBlocks((bs) => bs.filter((x) => x.id !== id));
  }

  // texto final que se manda en mensajes de tipo link / evento
  const finalText = (b: Block) =>
    b.type === "link" ? [b.text.trim(), b.url.trim()].filter(Boolean).join("\n")
    : b.type === "event" ? [`🗓 *${b.evTitle.trim()}*`, b.evAt && new Date(b.evAt).toLocaleString("es", { dateStyle: "full", timeStyle: "short" }), b.evPlace.trim() && `📍 ${b.evPlace.trim()}`, b.text.trim()].filter(Boolean).join("\n")
    : b.text;

  function toPayload(b: Block) {
    const base = { type: b.type, text: finalText(b), mention_all: b.mention_all, pin: b.pin, pin_days: b.pin_days };
    if (b.media) return { ...base, media_path: b.media.path, media_name: b.media.name, media_mime: b.media.mime };
    if (b.type === "poll") return { ...base, poll: { question: b.pollQ.trim(), options: b.pollOpts.map((o) => o.trim()).filter(Boolean), multiple: b.pollMulti } };
    if (b.type === "contact") return { ...base, contact: { name: b.cName.trim(), phone: b.cPhone.trim() } };
    return base;
  }

  function problem(): string | null {
    if (!name.trim()) return "El nombre es obligatorio.";
    if (kind === "campaign" ? campaignIds.length === 0 : groupIds.length === 0) return kind === "campaign" ? "Selecciona al menos una campaña." : "Selecciona al menos un grupo.";
    if (blocks.length === 0) return "Agrega al menos un mensaje.";
    for (const b of blocks) {
      const t = TYPES.find((x) => x.v === b.type)!.label;
      if (b.type === "text" && !b.text.trim()) return "Escribe el texto del mensaje.";
      if (["audio", "document", "media"].includes(b.type) && !b.media) return `Sube el archivo del bloque "${t}".`;
      if (b.type === "link" && !/^https?:\/\//i.test(b.url.trim())) return "El enlace debe empezar con http:// o https://.";
      if (b.type === "poll" && (!b.pollQ.trim() || b.pollOpts.filter((o) => o.trim()).length < 2)) return "La encuesta necesita una pregunta y al menos 2 opciones.";
      if (b.type === "contact" && (!b.cName.trim() || !b.cPhone.trim())) return "El contacto necesita nombre y teléfono.";
      if (b.type === "event" && (!b.evTitle.trim() || !b.evAt)) return "El evento necesita título y fecha.";
    }
    if (!sendNow && (!date || !time || new Date(`${date}T${time}`).getTime() < Date.now() - 60_000)) return "Elige una fecha y hora futuras.";
    if (rep.on && rep.end === "date" && !rep.until) return "Indica la fecha de finalización de la repetición.";
    if (rep.on && rep.end === "after" && rep.after < 1) return "Indica cuántas veces se repite.";
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = problem();
    if (p) return setErr(p);
    setErr(null);
    setSaving(true);
    const { error } = await supabase.rpc("save_group_message", {
      p_cfg: {
        name: name.trim(), kind, campaign_ids: campaignIds, group_ids: groupIds, only_current: onlyCurrent, speed, send_now: sendNow,
        scheduled_at: sendNow ? null : new Date(`${date}T${time}`).toISOString(), timezone: tz,
        repeat: { enabled: rep.on, frequency: rep.frequency, end: rep.end, after: rep.after, until: rep.until ? new Date(`${rep.until}T23:59`).toISOString() : null },
        blocks: blocks.map(toPayload),
      },
    });
    setSaving(false);
    if (error) return setErr(error.message);
    router.push("/calendar");
    router.refresh();
  }

  const groupOpts = targets.map((t) => ({ id: t.id, name: t.name, hint: `${t.participants} part.` }));
  const campOpts = campaigns.map((c) => ({ id: c.id, name: c.name, hint: `${c.groups} grupos` }));
  const firstGroup = kind === "group" && groupIds.length === 1 ? targets.find((t) => t.id === groupIds[0]) : null;
  const pinned = blocks.find((b) => b.pin);

  return (
    <form onSubmit={save} className="pb-28">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <Link href="/calendar" className="text-base text-slate-700 hover:text-slate-900">← Regresar</Link>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Crear mensaje programado</h1>
        </div>
        <button type="button" onClick={() => setPreview(true)} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-base font-medium shadow-sm hover:bg-slate-50">👁 Vista previa</button>
      </div>

      <div className="mt-6 grid items-start gap-8 xl:grid-cols-2">
        <div className="space-y-7">
          <div>
            <p className={lbl}>Tipo</p>
            <div className="flex gap-8" role="radiogroup" aria-label="Tipo de destino">
              <Radio on={kind === "campaign"} label="Campaña" onClick={() => setKind("campaign")} />
              <Radio on={kind === "group"} label="Grupo" onClick={() => setKind("group")} />
            </div>
          </div>

          <div>
            <label htmlFor="mname" className={lbl}>Nombre<span className="text-red-500">*</span></label>
            <input id="mname" maxLength={100} placeholder="Escribe el nombre" value={name} onChange={(e) => setName(e.target.value)} className={`${field} rounded-full`} />
            <p className="mt-1 text-right text-sm text-slate-500">{name.length}/100</p>
          </div>

          {kind === "campaign" ? (
            <>
              <Multi label="Campañas" placeholder="Buscar y seleccionar campañas..." options={campOpts} value={campaignIds} onChange={setCampaignIds} />
              <label className="flex cursor-pointer items-center gap-3 text-base text-slate-800">
                <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} className="h-5 w-5" />
                <span>👥 Solo grupos seleccionados actualmente <span className="text-slate-600">(No incluir grupos creados después de programar)</span></span>
              </label>
            </>
          ) : (
            <Multi label="Grupos" placeholder="Buscar y seleccionar grupos..." options={groupOpts} value={groupIds} onChange={setGroupIds} />
          )}

          <div>
            <p className={lbl}>Velocidad de envío</p>
            <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Velocidad de envío">
              {([["fast", "🐇", "Rápido", "1 mensaje cada 3 seg"], ["slow", "🐢", "Lento", "10-15 seg entre mensajes"]] as const).map(([v, icon, t, s]) => (
                <button key={v} type="button" role="radio" aria-checked={speed === v} onClick={() => setSpeed(v)}
                  className={`flex items-center gap-4 rounded-xl border p-5 text-left ${speed === v ? "border-slate-300 bg-slate-100" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                  <span className="text-2xl" aria-hidden>{icon}</span>
                  <span><span className="block text-lg font-semibold text-slate-900">{t}</span><span className="text-base text-slate-600">{s}</span></span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={lbl}>Opciones de envío</p>
            <div className="flex flex-wrap gap-8" role="radiogroup" aria-label="Opciones de envío">
              <Radio on={sendNow} label="Enviar mensaje ahora" onClick={() => setSendNow(true)} />
              <Radio on={!sendNow} label="Programar mensaje" onClick={() => setSendNow(false)} />
            </div>
          </div>

          {!sendNow && (
            <div>
              <p className="mb-3 text-base font-medium text-slate-800">Programar</p>
              <label htmlFor="mdate" className={lbl}>Fecha y hora<span className="text-red-500">*</span></label>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input id="mdate" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Fecha" />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} aria-label="Hora" />
                <input readOnly value={tz} aria-label="Zona horaria" className={`${field} bg-slate-50 text-slate-600 sm:w-48`} />
              </div>
            </div>
          )}

          <div className="border-t pt-5">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">🔁 Repetir mensaje
                <span title="El mensaje se volverá a enviar con la frecuencia que elijas, hasta el criterio de finalización" className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-400 text-xs font-normal text-slate-500">i</span></span>
              <Switch on={rep.on} label="Repetir mensaje" onChange={(v) => setRep({ ...rep, on: v })} />
            </div>
            {rep.on && (
              <div className="mt-4 space-y-5 border-l-2 border-slate-200 pl-5">
                <div>
                  <label htmlFor="rfreq" className={lbl}>Frecuencia</label>
                  <select id="rfreq" value={rep.frequency} onChange={(e) => setRep({ ...rep, frequency: e.target.value as typeof rep.frequency })} className={`${field} max-w-xs`}>
                    <option value="daily">Todos los días</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option>
                  </select>
                </div>
                <div>
                  <p className={lbl}>Finalización</p>
                  <div className="space-y-3" role="radiogroup" aria-label="Criterio de finalización">
                    <Radio on={rep.end === "never"} label="Nunca" onClick={() => setRep({ ...rep, end: "never" })} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Radio on={rep.end === "after"} label="Después de" onClick={() => setRep({ ...rep, end: "after" })} />
                      <input type="number" min={1} max={1000} aria-label="Número de veces" disabled={rep.end !== "after"} value={rep.after}
                        onChange={(e) => setRep({ ...rep, after: Math.max(1, Number(e.target.value) || 1) })} className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-center text-base disabled:bg-slate-50" />
                      <span className="text-base text-slate-700">veces</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Radio on={rep.end === "date"} label="En una fecha" onClick={() => setRep({ ...rep, end: "date" })} />
                      <input type="date" aria-label="Fecha de finalización" min={today()} disabled={rep.end !== "date"} value={rep.until}
                        onChange={(e) => setRep({ ...rep, until: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Tipo de mensaje</h2>
            <span className="text-base text-slate-600">{blocks.length}/{MAX_BLOCKS} mensajes</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {TYPES.map((t) => (
              <button key={t.v} type="button" disabled={blocks.length >= MAX_BLOCKS} onClick={() => setBlocks([...blocks, newBlock(t.v)])}
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-1 py-3 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                <span className="text-xl" aria-hidden>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {blocks.length === 0 ? (
            <div className="mt-4 flex h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 text-slate-600">
              <span className="mb-3 text-5xl text-slate-300" aria-hidden>📄</span>Ningún mensaje seleccionado
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">⠿ Arrastra para reordenar los mensajes</p>
              {blocks.map((b, i) => {
                const meta = TYPES.find((t) => t.v === b.type)!;
                const withText = ["text", "document", "media", "link", "event"].includes(b.type);
                return (
                  <section key={b.id} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(b.id)} className={`rounded-2xl border border-slate-300 bg-white ${drag === b.id ? "opacity-50" : ""}`}>
                    <header className="flex items-center gap-3 border-b px-4 py-3">
                      <span draggable onDragStart={() => setDrag(b.id)} onDragEnd={() => setDrag(null)} className="cursor-grab text-slate-400" title="Arrastra para reordenar" aria-hidden>⠿</span>
                      <h3 className="flex-1 text-lg font-semibold text-slate-900">{meta.title}</h3>
                      <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(b.id, -1)} className="px-1 text-slate-500 disabled:opacity-30">↑</button>
                      <button type="button" aria-label="Bajar" disabled={i === blocks.length - 1} onClick={() => move(b.id, 1)} className="px-1 text-slate-500 disabled:opacity-30">↓</button>
                      <button type="button" aria-label={b.open ? "Contraer" : "Expandir"} aria-expanded={b.open} onClick={() => patch(b.id, { open: !b.open })} className="px-1 text-slate-500">{b.open ? "⌃" : "⌄"}</button>
                      <button type="button" aria-label="Eliminar mensaje" onClick={() => removeBlock(b.id)} className="px-1 text-slate-500 hover:text-red-600">🗑</button>
                    </header>
                    {b.open && (
                      <div className="space-y-4 p-4">
                        {["audio", "document", "media"].includes(b.type) && (
                          <div>
                            {b.media ? (
                              <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dotted border-indigo-300 px-4 py-3 text-base">
                                <span className="truncate" title={b.media.name}>{b.type === "audio" ? "🎙" : b.type === "document" ? "📄" : b.media.mime.startsWith("video") ? "🎞" : "🖼"} {b.media.name}</span>
                                <button type="button" onClick={() => { supabase.storage.from("chat-media").remove([b.media!.path]); patch(b.id, { media: null }); }} className="shrink-0 text-indigo-600 hover:underline">Quitar</button>
                              </div>
                            ) : (
                              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dotted border-indigo-300 px-4 py-6 text-center text-base text-indigo-700 hover:bg-indigo-50">
                                <span className="text-2xl" aria-hidden>{meta.icon}</span>{busy === b.id ? "Subiendo…" : b.type === "audio" ? "Subir audio" : b.type === "document" ? "Subir documento" : "Subir imagen o video"}
                                <span className="text-xs text-slate-500">Máx. 16 MB</span>
                                <input type="file" hidden disabled={busy === b.id} accept={b.type === "audio" ? "audio/*" : b.type === "media" ? "image/*,video/*" : undefined}
                                  onChange={(e) => { upload(b.id, b.type === "audio" ? "audio" : b.type === "media" ? "image" : "any", e.target.files?.[0]); e.target.value = ""; }} />
                              </label>
                            )}
                          </div>
                        )}

                        {b.type === "link" && <input type="url" aria-label="Enlace" placeholder="https://..." value={b.url} onChange={(e) => patch(b.id, { url: e.target.value })} className={field} />}
                        {b.type === "event" && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <input aria-label="Título del evento" placeholder="Título del evento" value={b.evTitle} onChange={(e) => patch(b.id, { evTitle: e.target.value })} className={`${field} sm:col-span-2`} />
                            <input type="datetime-local" aria-label="Fecha del evento" value={b.evAt} onChange={(e) => patch(b.id, { evAt: e.target.value })} className={field} />
                            <input aria-label="Lugar" placeholder="Lugar o enlace (opcional)" value={b.evPlace} onChange={(e) => patch(b.id, { evPlace: e.target.value })} className={field} />
                          </div>
                        )}
                        {b.type === "poll" && (
                          <div className="space-y-2">
                            <input aria-label="Pregunta" placeholder="Pregunta de la encuesta" maxLength={200} value={b.pollQ} onChange={(e) => patch(b.id, { pollQ: e.target.value })} className={field} />
                            {b.pollOpts.map((o, k) => (
                              <div key={k} className="flex gap-2">
                                <input aria-label={`Opción ${k + 1}`} placeholder={`Opción ${k + 1}`} maxLength={100} value={o} onChange={(e) => patch(b.id, { pollOpts: b.pollOpts.map((x, j) => (j === k ? e.target.value : x)) })} className={field} />
                                {b.pollOpts.length > 2 && <button type="button" aria-label="Quitar opción" onClick={() => patch(b.id, { pollOpts: b.pollOpts.filter((_, j) => j !== k) })} className="px-2 text-slate-500">✕</button>}
                              </div>
                            ))}
                            <div className="flex items-center justify-between">
                              <button type="button" disabled={b.pollOpts.length >= 12} onClick={() => patch(b.id, { pollOpts: [...b.pollOpts, ""] })} className="text-base text-indigo-600 hover:underline disabled:opacity-40">+ Añadir opción</button>
                              <label className="flex items-center gap-2 text-base"><input type="checkbox" checked={b.pollMulti} onChange={(e) => patch(b.id, { pollMulti: e.target.checked })} />Permitir varias respuestas</label>
                            </div>
                          </div>
                        )}
                        {b.type === "contact" && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <input aria-label="Nombre del contacto" placeholder="Nombre del contacto" value={b.cName} onChange={(e) => patch(b.id, { cName: e.target.value })} className={field} />
                            <input aria-label="Teléfono del contacto" inputMode="tel" placeholder="Teléfono con código de país" value={b.cPhone} onChange={(e) => patch(b.id, { cPhone: e.target.value })} className={field} />
                          </div>
                        )}

                        {withText && (
                          <div>
                            <div className="rounded-xl border border-slate-300 p-3">
                              <textarea ref={(el) => { taRefs.current[b.id] = el; }} aria-label="Mensaje" rows={4} maxLength={4096} value={b.text} onChange={(e) => patch(b.id, { text: e.target.value })}
                                placeholder={b.type === "text" ? "Escribe un mensaje..." : "Escribe un texto (opcional)..."} className="w-full resize-none bg-transparent text-base text-slate-900 outline-none" />
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{b.text.length}/4096</p>
                            <div className="relative mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-slate-600">
                              <button type="button" aria-label="Emoji" onClick={() => setEmoji(emoji === b.id ? null : b.id)} className="text-xl">☺</button>
                              <button type="button" aria-label="Negrita" onClick={() => wrap(b.id, "*")} className="font-bold">B</button>
                              <button type="button" aria-label="Cursiva" onClick={() => wrap(b.id, "_")} className="italic">I</button>
                              <button type="button" aria-label="Tachado" onClick={() => wrap(b.id, "~")} className="line-through">S</button>
                              <button type="button" aria-label="Código" onClick={() => wrap(b.id, "```")} className="font-mono">{"<>"}</button>
                              <button type="button" disabled title="Próximamente" className="ml-auto rounded-full border px-4 py-2 text-base opacity-50">✦ Generar variaciones</button>
                              {emoji === b.id && (
                                <div className="absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl border bg-white p-2 text-lg shadow-lg">
                                  {EMOJIS.map((em) => <button key={em} type="button" onClick={() => addEmoji(b.id, em)}>{em}</button>)}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {b.type === "text" && (
                          <div className="space-y-3 border-t pt-3">
                            <label className="flex cursor-pointer items-start gap-3">
                              <input type="checkbox" checked={b.mention_all} onChange={(e) => patch(b.id, { mention_all: e.target.checked })} className="mt-1 h-5 w-5" />
                              <span><span className="block text-base text-slate-900">@ Mencionar a todos</span><span className="text-sm text-slate-500">Mejora la visibilidad notificando a todos los participantes</span></span>
                            </label>
                            <div className="flex items-center justify-between"><span className="text-base font-medium text-slate-900">📌 Fijar mensaje</span><Switch on={b.pin} label="Fijar mensaje" onChange={(v) => patch(b.id, { pin: v })} /></div>
                            {b.pin && (
                              <div className="pl-7">
                                <p className="mb-2 text-sm text-slate-600">Duración</p>
                                <div className="flex gap-6" role="radiogroup" aria-label="Duración">
                                  {([[1, "24h"], [7, "7 días"], [30, "30 días"]] as const).map(([d, l]) => <Radio key={d} on={b.pin_days === d} label={l} onClick={() => patch(b.id, { pin_days: d })} />)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setPreview(false)}>
          <div role="dialog" aria-modal="true" aria-label="Vista previa" onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-lg font-semibold">Vista previa</h2>
              <span className="flex items-center gap-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">WhatsApp</span>
                <button type="button" onClick={() => setPreview(false)} aria-label="Cerrar" className="h-8 w-8 rounded-full border text-slate-700">✕</button></span>
            </div>
            <div className="flex h-[520px] flex-col bg-[#0b1d24]">
              <div className="flex items-center gap-3 bg-[#1f3a40] px-4 py-3 text-white">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 font-semibold">{(firstGroup?.name ?? "Grupo de WhatsApp").charAt(0).toUpperCase()}</span>
                <span className="min-w-0"><span className="block truncate font-semibold">{firstGroup?.name ?? "Grupo de WhatsApp"}</span><span className="text-xs text-slate-300">{firstGroup?.participants ?? 32} participantes</span></span>
              </div>
              <div className="relative flex-1 space-y-2 overflow-y-auto p-4">
                {pinned && <span className="absolute right-4 top-1 rounded bg-emerald-700 px-2 py-0.5 text-[11px] text-white">📌 Fijado • {pinned.pin_days === 1 ? "24h" : `${pinned.pin_days} días`}</span>}
                <div className="pt-5" />
                {blocks.length === 0 && <p className="mt-10 text-center text-sm text-slate-400">Agrega un mensaje para ver cómo se verá</p>}
                {blocks.map((b) => (
                  <div key={b.id} className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#1f6f5c] px-3 py-2 text-sm text-white shadow">
                    {b.media && (b.media.mime.startsWith("image") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.media.preview} alt="" className="mb-1 max-h-40 w-full rounded object-cover" />
                    ) : b.media.mime.startsWith("video") ? <video src={b.media.preview} className="mb-1 max-h-40 w-full rounded" muted /> : <p className="mb-1 rounded bg-black/20 px-2 py-1">{b.type === "audio" ? "🎙" : "📄"} {b.media.name}</p>)}
                    {b.type === "poll" && <div><p className="font-semibold">📋 {b.pollQ || "Pregunta"}</p>{b.pollOpts.filter(Boolean).map((o, k) => <p key={k} className="mt-1 rounded bg-black/20 px-2 py-1">◯ {o}</p>)}</div>}
                    {b.type === "contact" && <p>👤 {b.cName || "Contacto"} · {b.cPhone}</p>}
                    {b.type !== "poll" && b.type !== "contact" && <p className="whitespace-pre-wrap break-words">{finalText(b) || (b.media ? "" : "Escribe un mensaje...")}</p>}
                    <p className="mt-1 text-right text-[11px] text-emerald-100">{new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false })} ✓✓</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-5 py-4 backdrop-blur md:left-[4.5rem]">
        {err && <p className="mb-2 text-right text-sm text-red-600" role="alert">{err}</p>}
        <div className="flex items-center justify-end gap-4">
          <Link href="/calendar" className="rounded-full px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">Cancelar</Link>
          <button disabled={saving || !!busy} className="rounded-full bg-slate-900 px-7 py-3 text-base font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "Guardando…" : sendNow ? "Enviar ahora" : "Programar mensaje"}
          </button>
        </div>
      </div>
    </form>
  );
}
