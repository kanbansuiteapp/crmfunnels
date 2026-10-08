"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnOutline, btnPrimary, inputCls, useMe } from "./kit";

const CATEGORIES = [{ v: "marketing", l: "Marketing" }, { v: "utility", l: "Utilidad" }, { v: "authentication", l: "Autenticación" }];
const HEADERS = [{ v: "none", l: "Ninguna" }, { v: "text", l: "Texto" }, { v: "image", l: "Imagen" }, { v: "video", l: "Video" }, { v: "document", l: "Documento" }];
const CONTACT_FIELDS = [{ v: "name", l: "Nombre" }, { v: "phone_number", l: "Teléfono" }, { v: "country_code", l: "País" }];
const EMOJIS = ["😀", "😊", "👍", "🙏", "🎉", "❤️", "🔥", "✅"];

type Channel = { id: string; name: string };
type Var = { n: number; field: string; example: string };
type Btn = { id: number; type: "quick_reply" | "url"; text: string; url: string };
const BTN_TYPES = [{ v: "quick_reply", l: "Personalizado" }, { v: "url", l: "Ir al sitio web" }] as const;
const MAX_BUTTONS = 10, MAX_URL = 2;
const validUrl = (u: string) => /^https?:\/\/\S+\.\S+/i.test(u.trim());

const varsIn = (body: string) => Array.from(new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => Number(m[1])))).sort((a, b) => a - b);

function Label({ text, required, hint }: { text: string; required?: boolean; hint?: string }) {
  return <label className="mb-2 mt-6 flex items-center justify-between text-sm font-semibold text-slate-900 first:mt-0"><span>{text}{required && <span className="text-red-500">*</span>}</span>{hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}</label>;
}

export function TemplateForm() {
  const router = useRouter();
  const me = useMe();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [customs, setCustoms] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("marketing");
  const [headerType, setHeaderType] = useState("none");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [device, setDevice] = useState("");
  const [vars, setVars] = useState<Record<number, Var>>({});
  const [emoji, setEmoji] = useState(false);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [menu, setMenu] = useState(false);
  const btnId = useRef(0);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();
    sb.from("channels").select("id,name").order("name").then(({ data }) => setChannels((data ?? []) as Channel[]));
    sb.from("custom_field_defs").select("id,name").order("name").then(({ data }) => setCustoms((data ?? []) as { id: string; name: string }[]));
  }, []);

  const nums = useMemo(() => varsIn(body), [body]);
  const trimmed = body.trim();
  const bodyErr = !trimmed ? "El cuerpo es obligatorio." : /^\{\{\d+\}\}/.test(trimmed) ? "El cuerpo no puede empezar con una variable. Agrega texto antes de {{N}}." : /\{\{\d+\}\}$/.test(trimmed) ? "El cuerpo no puede terminar con una variable. Agrega texto después de {{N}}." : "";
  const varErr = nums.some((n) => !vars[n]?.example?.trim());
  const btnErr = buttons.some((b) => !b.text.trim() || (b.type === "url" && !validUrl(b.url)));
  const urlCount = buttons.filter((b) => b.type === "url").length;
  const addButton = (type: Btn["type"]) => { setButtons([...buttons, { id: ++btnId.current, type, text: "", url: "" }]); setMenu(false); };
  const setButton = (id: number, patch: Partial<Btn>) => setButtons(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const errs = { name: name.trim() ? "" : "El nombre es obligatorio.", device: device ? "" : "Selecciona un dispositivo.", body: bodyErr };
  const showErr = (k: keyof typeof errs) => (tried || (k === "body" && !!trimmed)) && errs[k];

  const edit = (fn: (v: string, s: number, e: number) => { text: string; cursor: number }) => {
    const el = bodyRef.current; if (!el) return;
    const r = fn(body, el.selectionStart, el.selectionEnd);
    setBody(r.text.slice(0, 1024));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.cursor, r.cursor); });
  };
  const wrap = (c: string) => edit((v, s, e) => ({ text: v.slice(0, s) + c + v.slice(s, e) + c + v.slice(e), cursor: e + c.length * 2 }));
  const insert = (t: string) => edit((v, s, e) => ({ text: v.slice(0, s) + t + v.slice(e), cursor: s + t.length }));
  const addVar = () => insert(`{{${(nums.length ? Math.max(...nums) : 0) + 1}}}`);
  const setVar = (n: number, patch: Partial<Var>) => setVars({ ...vars, [n]: { ...({ n, field: "", example: "" } as Var), ...vars[n], ...patch } });

  const preview = body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n)]?.example || `{{${n}}}`);

  const save = async () => {
    setTried(true);
    if (errs.name || errs.device || errs.body || varErr || btnErr || !me) return;
    setBusy(true); setErr(null);
    const { error } = await createClient().from("message_templates").insert({
      organization_id: me.orgId, channel_id: device, name: name.trim(), category, header_type: headerType,
      header_text: headerType === "text" ? headerText.trim() || null : null, body: trimmed, footer: footer.trim() || null,
      buttons: buttons.map((b) => (b.type === "url" ? { type: b.type, text: b.text.trim(), url: b.url.trim() } : { type: b.type, text: b.text.trim() })),
      variables: nums.map((n) => ({ n, field: vars[n]?.field ?? "", example: vars[n]?.example.trim() })),
    });
    setBusy(false);
    if (error) return setErr("No se pudo guardar la plantilla.");
    router.push("/settings/templates");
  };

  const bad = (k: keyof typeof errs) => (showErr(k) ? "!border-red-400" : "");

  return (
    <main className="w-full p-6 md:px-10 md:py-8">
      <Link href="/settings/templates" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">← Regresar</Link>
      <h1 className="mt-1 text-3xl font-semibold text-slate-900">Crear plantilla</h1>
      <p className="mt-1 text-sm text-slate-500">Crea las plantillas para tus mensajes</p>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <Label text="Nombre de la plantilla" required hint={`${name.length}/512`} />
          <input value={name} maxLength={512} onChange={(e) => setName(e.target.value)} placeholder="Escribe el nombre" className={`${inputCls} ${bad("name")}`} />
          {showErr("name") && <p role="alert" className="mt-1 text-sm text-red-600">{errs.name}</p>}

          <Label text="Categoría" required />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>{CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>

          <Label text="Cabecera (Opcional)" />
          <select value={headerType} onChange={(e) => setHeaderType(e.target.value)} className={inputCls}>{HEADERS.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}</select>
          {headerType === "text" && <input value={headerText} maxLength={60} onChange={(e) => setHeaderText(e.target.value)} placeholder="Texto de la cabecera" className={`${inputCls} mt-3`} />}
          {["image", "video", "document"].includes(headerType) && <p className="mt-2 text-xs text-slate-500">El archivo de ejemplo se adjunta al enviar la plantilla a revisión de Meta.</p>}

          <Label text="Cuerpo" required hint={`${body.length}/1024`} />
          <div className={`rounded-md border bg-slate-50 ${showErr("body") ? "border-red-400" : "border-slate-200"}`}>
            <textarea ref={bodyRef} value={body} maxLength={1024} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un mensaje..." rows={6} className="w-full resize-y bg-transparent px-4 py-3 text-sm outline-none" />
            <div className="relative flex items-center gap-3 px-3 pb-2 text-slate-500">
              <button type="button" onClick={() => setEmoji(!emoji)} aria-label="Emoji" className="text-lg leading-none">☺</button>
              <button type="button" onClick={() => wrap("*")} aria-label="Negrita" className="font-bold">B</button>
              <button type="button" onClick={() => wrap("_")} aria-label="Cursiva" className="italic">I</button>
              <button type="button" onClick={() => wrap("~")} aria-label="Tachado" className="line-through">S</button>
              {emoji && <div className="absolute bottom-9 left-0 z-10 flex gap-1 rounded-lg border bg-white p-2 shadow-lg">{EMOJIS.map((e) => <button key={e} type="button" onClick={() => { insert(e); setEmoji(false); }} className="text-xl">{e}</button>)}</div>}
            </div>
          </div>
          <div className="mt-2 flex items-start justify-between gap-4">
            <p role={showErr("body") ? "alert" : undefined} className="text-sm text-red-600">{showErr("body")}</p>
            <button type="button" onClick={addVar} className={`${btnOutline} !px-3 !py-1.5 shrink-0`}>+ Agregar variable</button>
          </div>

          {nums.length > 0 && (
            <section className="mt-6">
              <h2 className="text-base font-semibold text-slate-900">Variables de la plantilla</h2>
              <p className="mt-1 text-xs text-slate-500">Asocia cada variable con un campo del contacto y un valor de ejemplo. El campo se usa por defecto al enviar la plantilla; el ejemplo se muestra a Meta durante la revisión.</p>
              {nums.map((n) => (
                <div key={n} className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <p className="font-semibold">{`{{${n}}}`}</p>
                  <label className="mt-3 block text-xs text-slate-600">Asociar con (campo del contacto)</label>
                  <select value={vars[n]?.field ?? ""} onChange={(e) => setVar(n, { field: e.target.value })} className={`${inputCls} mt-1`}>
                    <option value="">Selecciona un campo del contacto</option>
                    {CONTACT_FIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
                    {customs.map((c) => <option key={c.id} value={`custom:${c.id}`}>{c.name}</option>)}
                  </select>
                  <label className="mt-3 block text-xs text-slate-600">Valor de ejemplo (review de Meta)</label>
                  <input value={vars[n]?.example ?? ""} onChange={(e) => setVar(n, { example: e.target.value })} placeholder="Ej: Gabriel" className={`${inputCls} mt-1 ${tried && !vars[n]?.example?.trim() ? "!border-red-400" : ""}`} />
                </div>
              ))}
              {tried && varErr && <p role="alert" className="mt-2 text-sm text-red-600">Escribe un valor de ejemplo para cada variable.</p>}
            </section>
          )}

          <Label text="Pie de página (Opcional)" hint={`${footer.length}/60`} />
          <input value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} placeholder="Escribe el pie de página" className={inputCls} />

          <Label text="Botones (Opcional)" />
          <div className="relative inline-block">
            <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} disabled={buttons.length >= MAX_BUTTONS} className={`${btnOutline} disabled:opacity-50`}>
              <span className="text-lg leading-none">+</span> Añadir botón <span aria-hidden>⌄</span>
            </button>
            {menu && (
              <ul className="absolute left-0 z-10 mt-1 w-56 rounded-lg border bg-white py-1 shadow-lg">
                {BTN_TYPES.map((t) => (
                  <li key={t.v}>
                    <button type="button" disabled={t.v === "url" && urlCount >= MAX_URL} onClick={() => addButton(t.v)} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent">
                      {t.l}{t.v === "url" && urlCount >= MAX_URL ? " (máx. 2)" : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {buttons.map((b) => (
            <div key={b.id} className="mt-4 rounded-lg bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-900">{BTN_TYPES.find((t) => t.v === b.type)?.l}</h3>
              <div className="mt-3 flex items-end gap-4">
                <div className="min-w-0 flex-1">
                  <label className="mb-2 flex justify-between text-sm font-semibold text-slate-900"><span>Texto del botón<span className="text-red-500">*</span></span><span className="text-xs font-normal text-slate-500">{b.text.length}/25</span></label>
                  <input value={b.text} maxLength={25} onChange={(e) => setButton(b.id, { text: e.target.value })} placeholder="Texto del botón" className={`${inputCls} ${tried && !b.text.trim() ? "!border-red-400" : ""}`} />
                </div>
                {b.type === "url" && (
                  <div className="min-w-0 flex-1">
                    <label className="mb-2 flex justify-between text-sm font-semibold text-slate-900"><span>Url del sitio web<span className="text-red-500">*</span></span><span className="text-xs font-normal text-slate-500">{b.url.length}/2000</span></label>
                    <input value={b.url} maxLength={2000} onChange={(e) => setButton(b.id, { url: e.target.value })} placeholder="URL del botón" className={`${inputCls} ${tried && !validUrl(b.url) ? "!border-red-400" : ""}`} />
                  </div>
                )}
                <button type="button" onClick={() => setButtons(buttons.filter((x) => x.id !== b.id))} aria-label="Quitar botón" className="mb-3 text-slate-700 hover:text-red-600"><Icon name="trash" size={22} /></button>
              </div>
              {tried && b.type === "url" && b.url && !validUrl(b.url) && <p role="alert" className="mt-1 text-sm text-red-600">La URL debe empezar con http:// o https://</p>}
            </div>
          ))}
          {tried && btnErr && <p role="alert" className="mt-2 text-sm text-red-600">Completa el texto (y la URL) de cada botón.</p>}
          <Alert text={err} />
          <div className="sticky bottom-0 -mx-6 mt-10 flex justify-end gap-4 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
            <Link href="/settings/templates" className={`${btnOutline} min-w-40`}>Cancelar</Link>
            <button onClick={save} disabled={busy || !me} className={`${btnPrimary} min-w-40`}>{busy ? "Guardando..." : "Crear plantilla"}</button>
          </div>
        </div>

        <aside>
          <Label text="Dispositivo" required />
          <select value={device} onChange={(e) => setDevice(e.target.value)} className={`${inputCls} ${bad("device")}`}>
            <option value="">Selecciona un dispositivo</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {showErr("device") && <p role="alert" className="mt-1 text-sm text-red-600">{errs.device}</p>}
          <p className="mb-2 mt-8 text-sm font-semibold text-slate-900">Vista previa de la plantilla</p>
          <div className="rounded-xl bg-slate-50 p-6">
            <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-4 border-white bg-[#ece5dd] shadow-lg">
              <div className="flex items-center gap-2 bg-[#128c7e] px-4 py-3 text-sm font-semibold text-white"><span className="h-6 w-6 rounded-full bg-white/30" /> WhatsApp</div>
              <div className="min-h-[300px] p-3">
                {(trimmed || headerType !== "none" || footer) && (
                  <div className="ml-auto max-w-[90%] rounded-lg bg-[#dcf8c6] p-2 text-sm shadow-sm">
                    {headerType === "text" && headerText && <p className="mb-1 font-semibold">{headerText}</p>}
                    {["image", "video", "document"].includes(headerType) && <div className="mb-1 flex h-24 items-center justify-center rounded bg-white/60 text-xs text-slate-500">{HEADERS.find((h) => h.v === headerType)?.l}</div>}
                    <p className="whitespace-pre-wrap break-words">{preview}</p>
                    {footer && <p className="mt-1 text-xs text-slate-500">{footer}</p>}
                  </div>
                )}
                {buttons.length > 0 && (
                  <div className="ml-auto mt-1 max-w-[90%] space-y-1">
                    {buttons.map((b) => <div key={b.id} className="rounded-lg bg-white py-2 text-center text-sm font-medium text-sky-600 shadow-sm">{b.type === "url" ? "↗ " : "↩ "}{b.text || "Texto del botón"}</div>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
