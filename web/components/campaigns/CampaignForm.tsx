"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Kind = "group" | "community" | "channel";
export type Cfg = {
  type: Kind; name: string; description: string; image_path: string; auto_create: boolean; who_can_send: "admins" | "all";
  admin_channel_ids: string[]; backup_admins: string[]; moderation: boolean; moderation_mode: "all" | "ai"; moderation_criteria: string[];
  max_participants: number; max_clicks: number; strategy: "balanced" | "sequential"; remember_visitor: boolean; reserve_groups: number;
  numbering_position: "start" | "end"; numbering_start: number; custom_path: string; tag_in: string; tag_out: string;
  tracking_code: string; silent_protection: boolean;
};
export type Device = { id: string; name: string; phone: string; connected: boolean };
export type ExistingGroup = { id: string; name: string; type: Kind; participants: number };

export const DEFAULT_CFG: Cfg = {
  type: "group", name: "", description: "", image_path: "", auto_create: true, who_can_send: "admins",
  admin_channel_ids: [], backup_admins: [], moderation: false, moderation_mode: "ai", moderation_criteria: ["insults", "negative", "spam", "links", "promo"],
  max_participants: 1000, max_clicks: 1000, strategy: "balanced", remember_visitor: true, reserve_groups: 0,
  numbering_position: "end", numbering_start: 1, custom_path: "", tag_in: "", tag_out: "", tracking_code: "", silent_protection: false,
};

const KINDS: { v: Kind; label: string; icon: string }[] = [
  { v: "group", label: "Grupo", icon: "👥" }, { v: "community", label: "Comunidad", icon: "👥" }, { v: "channel", label: "Canal", icon: "📣" },
];
const CRITERIA: { v: string; title: string; sub: string }[] = [
  { v: "insults", title: "Insultos y groserías", sub: "Palabras ofensivas, insultos directos o lenguaje vulgar" },
  { v: "negative", title: "Comentarios negativos", sub: "Críticas destructivas, quejas o comentarios pesimistas" },
  { v: "spam", title: "Spam y repetitivos", sub: "Mensajes repetidos, caracteres aleatorios o contenido sin sentido" },
  { v: "links", title: "Enlaces externos", sub: "URLs, links de WhatsApp, Telegram u otras plataformas" },
  { v: "promo", title: "Promociones y ventas", sub: "Publicidad, ofertas de productos o servicios de terceros" },
  { v: "offtopic", title: "Fuera de tema", sub: "Comentarios que no tienen relación con el contenido del canal" },
];
const DIAL = ["+57", "+52", "+54", "+56", "+51", "+593", "+58", "+34", "+1", "+55"];
const EMOJIS = ["😀", "😊", "😉", "😍", "🙏", "👍", "👋", "🎉", "🔥", "✅", "⭐", "💬", "🎁", "💡", "❤️", "🚀"];

const card = "rounded-2xl border border-slate-300 bg-white p-6";
const field = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500";
const lbl = "mb-1.5 block text-sm font-semibold text-slate-800";
const sub = "text-sm text-slate-600";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-slate-900" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Radio({ on, title, text, onClick }: { on: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${on ? "border-slate-900 bg-slate-100" : "border-slate-300 hover:bg-slate-50"}`}>
      <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-slate-900" : "border-slate-300"}`}>
        {on && <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />}
      </span>
      <span><span className="block text-base font-semibold text-slate-900">{title}</span><span className={sub}>{text}</span></span>
    </button>
  );
}

function Emoji({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" aria-label="Emoji" onClick={() => setOpen((v) => !v)} className="text-xl text-slate-500 hover:text-slate-900">☺</button>
      {open && (
        <span className="absolute right-0 top-full z-20 mt-2 grid w-56 grid-cols-8 gap-1 rounded-xl border bg-white p-2 text-lg shadow-lg">
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => { onPick(e); setOpen(false); }}>{e}</button>)}
        </span>
      )}
    </span>
  );
}

export function CampaignForm({
  orgId, devices, tags, groups, campaignId, initial, initialGroupIds,
}: {
  orgId: string; devices: Device[]; tags: string[]; groups: ExistingGroup[];
  campaignId?: string; initial?: Cfg; initialGroupIds?: string[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [id, setId] = useState<string | null>(campaignId ?? null);
  const [c, setC] = useState<Cfg>(initial ?? DEFAULT_CFG);
  const [ids, setIds] = useState<string[]>(initialGroupIds ?? []);
  const [advanced, setAdvanced] = useState(false);
  const [existing, setExisting] = useState(!!initialGroupIds?.length);
  const [adminOpen, setAdminOpen] = useState(false);
  const [dial, setDial] = useState("+57");
  const [backup, setBackup] = useState("");
  const [gq, setGq] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState("");
  const adminBox = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setC((p) => ({ ...p, [k]: v }));

  useEffect(() => { setHost(window.location.host); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => adminBox.current && !adminBox.current.contains(e.target as Node) && setAdminOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    // campaña ya creada: se muestra la imagen guardada
    if (!c.image_path || preview) return;
    supabase.storage.from("chat-media").createSignedUrl(c.image_path, 3600).then(({ data }) => data?.signedUrl && setPreview(data.signedUrl));
  }, [c.image_path, preview, supabase]);

  const autoOk = c.type === "group" && c.auto_create;
  const checks = [c.name.trim() !== "", c.description.trim() !== "", c.admin_channel_ids.length > 0, autoOk || ids.length > 0];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const connected = devices.filter((d) => d.connected);
  const num = c.numbering_start;
  const label = (n: number) => (c.numbering_position === "start" ? `#${n} ${c.name.trim() || "Nombre"}` : `${c.name.trim() || "Nombre"} #${n}`);
  const slugShown = c.custom_path.trim().toLowerCase() || "auto-generado";
  const choices = groups.filter((g) => g.type === c.type && g.name.toLowerCase().includes(gq.trim().toLowerCase()));

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("El archivo debe ser una imagen.");
    if (f.size > 8 * 1024 * 1024) return setErr("La imagen supera 8 MB.");
    setUpBusy(true);
    setErr(null);
    const path = `${orgId}/campaigns/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-60)}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, f, { contentType: f.type });
    setUpBusy(false);
    if (error) return setErr(`No se pudo subir la imagen: ${error.message}`);
    if (c.image_path) supabase.storage.from("chat-media").remove([c.image_path]);
    set("image_path", path);
    setPreview(URL.createObjectURL(f));
  }

  function addBackup() {
    const n = backup.replace(/\D/g, "");
    if (n.length < 6) return setErr("Escribe un número de teléfono válido.");
    const full = dial.replace("+", "") + n;
    if (!c.backup_admins.includes(full)) set("backup_admins", [...c.backup_admins, full]);
    setBackup("");
    setErr(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!checks.every(Boolean)) {
      return setErr(
        !checks[0] ? "El nombre es obligatorio." : !checks[1] ? "La descripción es obligatoria."
        : !checks[2] ? "Debes agregar al menos 1 número conectado como administrador."
        : "Selecciona al menos un registro ya importado, o activa la creación automática de grupos.");
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("save_group_campaign", { p_id: id, p_cfg: c, p_group_ids: ids });
    if (error) { setBusy(false); return setErr(error.message); }
    const cid = data as string;
    setId(cid);
    if (autoOk) {
      const r = await supabase.functions.invoke("campaign-create", { body: { campaign_id: cid } });
      if (r.error || r.data?.error) {
        setBusy(false);
        return setErr(`La campaña se guardó, pero no se pudo crear el grupo en WhatsApp: ${r.data?.error ?? "error de conexión"}. Corrige y vuelve a pulsar guardar.`);
      }
    }
    setBusy(false);
    router.push("/group-campaigns");
    router.refresh();
  }

  const typeLabel = KINDS.find((k) => k.v === c.type)!.label;
  const adminsCount = c.admin_channel_ids.length + c.backup_admins.length;

  return (
    <form onSubmit={save} className="pb-28">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/group-campaigns" aria-label="Volver" className="text-2xl text-slate-700 hover:text-slate-900">←</Link>
          <h1 className="text-3xl font-bold text-slate-900">{campaignId ? "Editar campaña" : "Nueva campaña"}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-base font-semibold text-slate-800">{pct} %</span>
          <span className="hidden h-2 w-48 overflow-hidden rounded-full bg-slate-200 sm:block" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del formulario">
            <span className="block h-2 rounded-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <section className={`${card} flex items-center justify-between gap-4 bg-slate-50`}>
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-xl" aria-hidden>👥</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Creación automática de grupos</h2>
                <p className={sub}>{c.type === "group" ? "Los grupos se crearán automáticamente cuando se vayan llenando" : "Solo disponible para grupos. En comunidades y canales usa los que ya importaste."}</p>
              </div>
            </div>
            <Switch on={autoOk} label="Creación automática de grupos" onChange={(v) => c.type === "group" && set("auto_create", v)} />
          </section>

          <section className={card}>
            <div className="flex flex-wrap gap-4">
              <input ref={fileIn} type="file" accept="image/*" hidden onChange={pickImage} />
              <button type="button" onClick={() => fileIn.current?.click()} disabled={upBusy}
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 text-center text-xs text-slate-600 hover:bg-slate-50">
                {preview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={preview} alt="Imagen de la campaña" className="h-full w-full object-cover" />
                  : <><span className="text-xl" aria-hidden>🖼️</span>{upBusy ? "Subiendo…" : "Subir imagen"}<span className="text-[10px] text-slate-500">Max. 8MB</span></>}
              </button>
              <div className="min-w-0 flex-1">
                <div className="mb-4 flex flex-wrap gap-3" role="radiogroup" aria-label="Tipo de campaña">
                  {KINDS.map((k) => (
                    <button key={k.v} type="button" role="radio" aria-checked={c.type === k.v}
                      onClick={() => { if (k.v !== c.type) { setC({ ...c, type: k.v, auto_create: k.v === "group" ? c.auto_create : false }); setIds([]); } }}
                      className={`rounded-full border px-5 py-2.5 text-base ${c.type === k.v ? "border-slate-900 bg-slate-100 font-semibold" : "border-slate-300 hover:bg-slate-50"}`}>
                      <span aria-hidden>{k.icon}</span> {k.label}
                    </button>
                  ))}
                </div>
                <label htmlFor="cname" className={lbl}>Nombre *</label>
                <div className="relative">
                  <input id="cname" required maxLength={80} placeholder="Ej: Comunidad Funnelchat" value={c.name} onChange={(e) => set("name", e.target.value)} className={`${field} pr-14`} />
                  <span className="absolute right-4 top-3"><Emoji onPick={(e) => set("name", (c.name + e).slice(0, 80))} /></span>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="cdesc" className="text-sm font-semibold text-slate-800">Descripción *</label>
                <Emoji onPick={(e) => set("description", (c.description + e).slice(0, 500))} />
              </div>
              <textarea id="cdesc" required rows={3} maxLength={500} placeholder="Describe brevemente el propósito de esta campaña..."
                value={c.description} onChange={(e) => set("description", e.target.value)} className={field} />
            </div>
          </section>

          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Administradores *</h2>
            {c.admin_channel_ids.length === 0 && (
              <p className="mb-4 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-700">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white" aria-hidden>✕</span>
                Debes agregar al menos 1 número conectado como administrador.
              </p>
            )}
            <div className="grid gap-5 md:grid-cols-2">
              <div ref={adminBox} className="relative">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Números conectados</p>
                <button type="button" aria-haspopup="listbox" aria-expanded={adminOpen} onClick={() => setAdminOpen((v) => !v)}
                  className={`${field} flex items-center justify-between text-left ${c.admin_channel_ids.length ? "" : "text-slate-500"}`}>
                  <span>{c.admin_channel_ids.length ? `${c.admin_channel_ids.length} seleccionado(s)` : "Seleccionar número"}</span><span aria-hidden>⌄</span>
                </button>
                {adminOpen && (
                  <ul role="listbox" aria-multiselectable className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border bg-white py-1 shadow-lg">
                    {devices.length === 0 && <li className="px-4 py-3 text-sm text-slate-600">No tienes números. Conecta uno en la bandeja.</li>}
                    {devices.map((d) => {
                      const on = c.admin_channel_ids.includes(d.id);
                      return (
                        <li key={d.id} role="option" aria-selected={on}>
                          <button type="button" disabled={!d.connected && !on}
                            onClick={() => set("admin_channel_ids", on ? c.admin_channel_ids.filter((x) => x !== d.id) : [...c.admin_channel_ids, d.id])}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-base hover:bg-slate-50 disabled:opacity-50">
                            <input type="checkbox" readOnly checked={on} />
                            <span className="min-w-0 flex-1 truncate">{d.name} {d.phone && <span className="text-slate-500">({d.phone})</span>}</span>
                            <span className={`text-xs ${d.connected ? "text-green-700" : "text-slate-500"}`}>{d.connected ? "Conectado" : "Desconectado"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-1.5 text-xs text-amber-700">Los administradores deben estar en los contactos del número creador</p>
                {c.admin_channel_ids.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {c.admin_channel_ids.map((cid, i) => {
                      const d = devices.find((x) => x.id === cid);
                      return (
                        <li key={cid} className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm text-green-800">
                          {d?.name ?? "Número"}{i === 0 && <span className="rounded bg-green-200 px-1.5 text-[11px]">Creador</span>}
                          <button type="button" aria-label="Quitar" onClick={() => set("admin_channel_ids", c.admin_channel_ids.filter((x) => x !== cid))}>✕</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Añadir backup</p>
                <div className="flex gap-2">
                  <select aria-label="Prefijo" value={dial} disabled={connected.length === 0 || c.admin_channel_ids.length === 0} onChange={(e) => setDial(e.target.value)}
                    className="w-24 rounded-xl border border-slate-300 bg-white px-2 py-3 text-base disabled:bg-slate-50">
                    {DIAL.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <input inputMode="tel" aria-label="Teléfono de respaldo" value={backup} disabled={c.admin_channel_ids.length === 0}
                    placeholder={c.admin_channel_ids.length ? "Número de teléfono" : "Primero agrega un admin conectado"}
                    onChange={(e) => setBackup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBackup())}
                    className={`${field} disabled:bg-slate-50`} />
                  <button type="button" aria-label="Añadir backup" disabled={!backup.trim()} onClick={addBackup}
                    className="h-12 w-12 shrink-0 rounded-full bg-slate-500 text-2xl text-white hover:bg-slate-700 disabled:opacity-40">+</button>
                </div>
                {c.admin_channel_ids.length === 0 && <p className="mt-1.5 text-xs text-amber-700">Primero selecciona un número conectado para poder añadir backups</p>}
                {c.backup_admins.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {c.backup_admins.map((n) => (
                      <li key={n} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">+{n}
                        <button type="button" aria-label={`Quitar ${n}`} onClick={() => set("backup_admins", c.backup_admins.filter((x) => x !== n))}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">¿Quién puede enviar mensajes?</h2>
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Quién puede enviar mensajes">
              <Radio on={c.who_can_send === "admins"} title="Solo admins" text="Únicamente los administradores escriben" onClick={() => set("who_can_send", "admins")} />
              <Radio on={c.who_can_send === "all"} title="Todos" text="Cualquier participante puede escribir" onClick={() => set("who_can_send", "all")} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 bg-white">
            <button type="button" onClick={() => setExisting((v) => !v)} aria-expanded={existing} className="flex w-full items-center justify-between p-6 text-left">
              <span><span className="text-lg font-semibold text-slate-900">Usar {c.type === "group" ? "grupos" : c.type === "community" ? "comunidades" : "canales"} ya importados</span>{" "}
                <span className="text-sm text-slate-500">({autoOk ? "opcional" : "obligatorio"} · {ids.length} seleccionados)</span></span>
              <span aria-hidden>{existing ? "⌃" : "⌄"}</span>
            </button>
            {existing && (
              <div className="space-y-3 border-t border-slate-200 p-6">
                <input type="search" aria-label="Buscar" placeholder="Buscar para agregar…" value={gq} onChange={(e) => setGq(e.target.value)} className={field} />
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-1">
                  {choices.length === 0 && <li className="px-3 py-5 text-center text-sm text-slate-600">
                    {groups.some((g) => g.type === c.type) ? "Sin resultados." : "Primero importa registros de este tipo en Grupos y comunidades."}
                  </li>}
                  {choices.map((g) => (
                    <li key={g.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-base hover:bg-slate-50">
                        <input type="checkbox" checked={ids.includes(g.id)} onChange={() => setIds(ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id])} />
                        <span className="min-w-0 flex-1 truncate">{g.name}</span><span className="text-sm text-slate-500">{g.participants} part.</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-600">El orden en que los marcas es el orden en que se llenan.</p>
              </div>
            )}
          </section>

          <section className={`${card} flex items-center justify-between gap-4`}>
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600" aria-hidden>💬</span>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                Moderación de comentarios
                <span title="Controla qué comentarios se mantienen en los canales de la campaña" className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-400 text-xs font-normal text-slate-500">i</span>
              </h2>
            </div>
            <Switch on={c.moderation} label="Moderación de comentarios" onChange={(v) => set("moderation", v)} />
          </section>
          {c.moderation && (
            <div className="space-y-3" role="radiogroup" aria-label="Modo de moderación">
              {([
                ["all", "🗑", "Eliminar todo", "Borra automáticamente cualquier comentario que se publique en los canales", "bg-red-50 text-red-500"],
                ["ai", "🤖", "Analizar con IA", "Analiza el contenido y elimina solo los comentarios que coincidan con los criterios seleccionados", "bg-slate-100 text-slate-600"],
              ] as const).map(([v, icon, title, text, tone]) => (
                <button key={v} type="button" role="radio" aria-checked={c.moderation_mode === v} onClick={() => set("moderation_mode", v)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left ${c.moderation_mode === v ? "border-slate-300 bg-slate-100" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${tone}`} aria-hidden>{icon}</span>
                  <span><span className="block text-lg font-semibold text-slate-900">{title}</span><span className="text-base text-slate-600">{text}</span></span>
                </button>
              ))}
              {c.moderation_mode === "ai" && (
                <div className="grid gap-3 pt-1 md:grid-cols-2">
                  {CRITERIA.map((k) => {
                    const on = c.moderation_criteria.includes(k.v);
                    return (
                      <button key={k.v} type="button" role="checkbox" aria-checked={on}
                        onClick={() => set("moderation_criteria", on ? c.moderation_criteria.filter((x) => x !== k.v) : [...c.moderation_criteria, k.v])}
                        className="flex items-start gap-3 rounded-2xl border border-slate-300 bg-white p-5 text-left hover:bg-slate-50">
                        <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-slate-900" : "border-slate-300"}`}>
                          {on && <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />}
                        </span>
                        <span><span className="block text-lg font-semibold text-slate-900">{k.title}</span><span className="text-sm text-slate-600">{k.sub}</span></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <section className="rounded-2xl border border-slate-300 bg-white">
            <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="flex w-full items-center justify-between p-6 text-left">
              <span className="flex items-center gap-3"><span aria-hidden>⚙️</span><span className="text-lg font-semibold text-slate-900">Configuración avanzada</span><span className="text-sm text-slate-500">(opcional)</span></span>
              <span aria-hidden>{advanced ? "⌃" : "⌄"}</span>
            </button>
            {advanced && (
              <div className="space-y-8 border-t border-slate-200 p-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Límites de capacidad</h3>
                  <p className={`${sub} mb-3`}>Define cuántas personas pueden unirse a cada grupo</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><label className={lbl} htmlFor="maxp">Máximo de participantes por grupo</label>
                      <input id="maxp" type="number" min={1} value={c.max_participants} onChange={(e) => set("max_participants", Math.max(1, Number(e.target.value) || 1))} className={field} /></div>
                    <div><label className={lbl} htmlFor="maxc">Máximo de clics por grupo</label>
                      <input id="maxc" type="number" min={1} value={c.max_clicks} onChange={(e) => set("max_clicks", Math.max(1, Number(e.target.value) || 1))} className={field} /></div>
                  </div>
                </div>

                <div className="border-t pt-8">
                  <h3 className="text-lg font-semibold text-slate-900">Distribución de visitas</h3>
                  <p className={`${sub} mb-3`}>Controla cómo se llenan tus grupos cuando llegan nuevos participantes</p>
                  <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Distribución de visitas">
                    <Radio on={c.strategy === "balanced"} title="Equilibrado" text="Las personas se distribuyen entre todos los grupos para mantenerlos balanceados" onClick={() => set("strategy", "balanced")} />
                    <Radio on={c.strategy === "sequential"} title="Uno a la vez" text="Llena un grupo completamente antes de pasar al siguiente" onClick={() => set("strategy", "sequential")} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-slate-300 p-4">
                    <div><p className="text-base font-semibold text-slate-900">Recordar grupo del visitante</p>
                      <p className={sub}>Si alguien visita el link otra vez, lo enviamos al mismo grupo donde entró antes</p></div>
                    <Switch on={c.remember_visitor} label="Recordar grupo del visitante" onChange={(v) => set("remember_visitor", v)} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-slate-300 p-4">
                    <div><p className="text-base font-semibold text-slate-900">Grupo de reserva</p>
                      <p className={sub}>Cuando un grupo se llena, el siguiente ya estará listo sin demoras</p></div>
                    <input type="number" min={0} max={50} aria-label="Grupos de reserva" value={c.reserve_groups}
                      onChange={(e) => set("reserve_groups", Math.min(50, Math.max(0, Number(e.target.value) || 0)))} className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-center text-base" />
                  </div>
                </div>

                <div className="border-t pt-8">
                  <h3 className="text-lg font-semibold text-slate-900"># Numeración automática</h3>
                  <p className={`${sub} mb-3`}>Tus grupos se nombran solos con un número correlativo</p>
                  <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
                    <div><p className={lbl}>Posición del número</p>
                      <div className="flex gap-2">
                        {(["start", "end"] as const).map((p) => (
                          <button key={p} type="button" aria-pressed={c.numbering_position === p} onClick={() => set("numbering_position", p)}
                            className={`rounded-xl border px-6 py-3 text-base ${c.numbering_position === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>{p === "start" ? "Al inicio" : "Al final"}</button>
                        ))}
                      </div></div>
                    <div><label className={lbl} htmlFor="nstart">Comienza en</label>
                      <input id="nstart" type="number" min={0} value={c.numbering_start} onChange={(e) => set("numbering_start", Math.max(0, Number(e.target.value) || 0))} className={field} /></div>
                    <div><p className={lbl}>Ejemplo</p><p className={`${field} bg-slate-50`}>{label(num)}</p></div>
                  </div>
                </div>

                <div className="border-t pt-8">
                  <h3 className="text-lg font-semibold text-slate-900">Link personalizado</h3>
                  <p className={`${sub} mb-3`}>Usa una ruta propia en lugar del código generado</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><label className={lbl} htmlFor="dom">Dominio</label><input id="dom" readOnly value={host} className={`${field} bg-slate-50`} /></div>
                    <div><label className={lbl} htmlFor="path">Ruta personalizada</label>
                      <div className="flex items-center gap-2"><span className="text-slate-500">/g/</span>
                        <input id="path" placeholder="mi-grupo" value={c.custom_path} maxLength={40}
                          onChange={(e) => set("custom_path", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className={field} /></div></div>
                  </div>
                  <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tu link será</p>
                    <p className="mt-1 font-mono text-base text-slate-900 break-all">https://{host}/g/<span className="italic text-slate-600">{slugShown}</span></p>
                  </div>
                </div>

                <div className="border-t pt-8">
                  <h3 className="text-lg font-semibold text-slate-900">Tags de seguimiento</h3>
                  <p className={`${sub} mb-3`}>Vincula tags para identificar entrada y salida de usuarios</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><label className={lbl} htmlFor="tin">Tag de entrada</label>
                      <select id="tin" value={c.tag_in} onChange={(e) => set("tag_in", e.target.value)} className={field}><option value="">Seleccionar Tag</option>{tags.map((t) => <option key={t}>{t}</option>)}</select></div>
                    <div><label className={lbl} htmlFor="tout">Tag de salida</label>
                      <select id="tout" value={c.tag_out} onChange={(e) => set("tag_out", e.target.value)} className={field}><option value="">Seleccionar Tag</option>{tags.map((t) => <option key={t}>{t}</option>)}</select></div>
                  </div>
                </div>

                <div className="border-t pt-8">
                  <h3 className="text-lg font-semibold text-slate-900">Seguimiento de conversiones</h3>
                  <p className={`${sub} mb-3`}>Conecta píxeles y scripts de analytics para saber quién entra a tus grupos</p>
                  <label className={lbl} htmlFor="trk">Código de seguimiento</label>
                  <textarea id="trk" rows={4} placeholder="<!-- Pega aquí tu código de seguimiento -->" value={c.tracking_code}
                    onChange={(e) => set("tracking_code", e.target.value)} className={`${field} font-mono text-sm`} />
                </div>

                <div className="border-t pt-8">
                  <h3 className="text-lg font-semibold text-slate-900">Seguridad Anti-bots</h3>
                  <p className={`${sub} mb-3`}>Protege tu campaña del tráfico automatizado y spam</p>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 p-4">
                    <div><p className="text-base font-semibold text-slate-900">Protección silenciosa</p>
                      <p className={sub}>Valida si el visitante es un humano real sin mostrar CAPTCHA visible. Ideal para mantener la calidad de tus contactos.</p></div>
                    <Switch on={c.silent_protection} label="Protección silenciosa" onChange={(v) => set("silent_protection", v)} />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4" aria-label="Vista previa">
          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white">
            <div className="bg-[#2d5a50] p-5 text-white">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-2xl text-emerald-700">
                  {preview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={preview} alt="" className="h-full w-full object-cover" />
                    : "👥"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{label(num)}</p>
                  <p className="text-sm text-emerald-100">{typeLabel} · {c.max_participants.toLocaleString("es")} participantes</p>
                </div>
              </div>
              <hr className="my-4 border-white/25" />
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Descripción</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-base">{c.description.trim() || `Agrega una descripción para tu ${typeLabel.toLowerCase()}...`}</p>
            </div>
            <div className="flex items-center justify-between border-b px-5 py-3 text-xs text-slate-600">
              <span className="flex items-center gap-2">
                <span className="flex -space-x-2">{[0, 1, 2].map((i) => (
                  <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] text-white ${["bg-black", "bg-slate-500", "bg-slate-400"][i]}`}>#{num + i}</span>))}</span>
                Numeración: {c.numbering_position === "start" ? "Al inicio" : "Al final"}
              </span>
              <span>Máx. {c.max_participants.toLocaleString("es")}</span>
            </div>
            <div className="p-5">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Información</h3>
              <dl className="space-y-2.5 text-base">
                {[["Tipo", typeLabel], ["Admins", String(adminsCount)], ["Máx. participantes", c.max_participants.toLocaleString("es")], ["Estrategia", c.strategy === "balanced" ? "Paralelo" : "Secuencial"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><dt className="text-slate-600">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-5 py-4 backdrop-blur md:left-[4.5rem]">
        {err && <p className="mb-2 text-right text-sm text-red-600" role="alert">{err}</p>}
        <div className="flex items-center justify-end gap-4">
          <Link href="/group-campaigns" className="rounded-full px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">Cancelar</Link>
          <button disabled={busy} className="rounded-full bg-slate-900 px-7 py-3 text-base font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            {busy ? "Guardando…" : campaignId || id ? "Guardar campaña" : "Crear campaña"}
          </button>
        </div>
      </div>
    </form>
  );
}
