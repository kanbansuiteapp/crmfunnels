"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Quick = { id: string; shortcut: string; content: string };
export type Attachment = { path: string; name: string; mime: string; preview?: string };

const MAX_MB = 10;
const safeName = (n: string) => n.replace(/[^\w.-]+/g, "_").slice(-80) || "archivo";
const baseMime = (m: string) => m.split(";")[0] || "application/octet-stream";

const EMOJIS = ["😀", "😂", "😊", "😍", "🥰", "😉", "😎", "🤔", "😅", "🙏", "👍", "👏", "🙌", "💪", "🔥", "🎉", "❤️", "✅", "⭐", "📞", "📍", "💰", "🎁", "👋"];

export function Composer({
  channelName, isAdmin, orgId, conversationId, onSend,
}: {
  channelName: string; isAdmin: boolean; orgId: string; conversationId: string;
  onSend: (text: string, media?: Attachment) => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [quick, setQuick] = useState<Quick[]>([]);
  const [idx, setIdx] = useState(0);
  const [pop, setPop] = useState<"emoji" | "quick" | null>(null);
  const [form, setForm] = useState({ shortcut: "", content: "" });
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [att, setAtt] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaErr, setMediaErr] = useState<string | null>(null);
  const [rec, setRec] = useState<{ seconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);

  async function loadQuick() {
    const { data } = await supabase.from("quick_replies").select("id, shortcut, content").order("shortcut");
    setQuick((data ?? []) as Quick[]);
  }
  useEffect(() => {
    loadQuick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setPop(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // "/" al inicio abre la lista de respuestas rápidas filtrada por lo que se escribe después
  const slash = /^\/([a-z0-9_-]*)$/i.exec(text);
  const matches = slash ? quick.filter((q) => q.shortcut.startsWith(slash[1].toLowerCase())) : [];
  const showQuick = !!slash && matches.length > 0;

  function insert(value: string) {
    setText(value);
    setIdx(0);
    requestAnimationFrame(() => area.current?.focus());
  }

  // negrita/cursiva/tachado de WhatsApp: *texto*  _texto_  ~texto~
  function wrap(mark: string) {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = text.slice(0, a) + mark + text.slice(a, b) + mark + text.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + mark.length, b + mark.length);
    });
  }

  function addEmoji(e: string) {
    const el = area.current;
    const pos = el?.selectionStart ?? text.length;
    setText(text.slice(0, pos) + e + text.slice(pos));
    setPop(null);
    requestAnimationFrame(() => el?.focus());
  }

  // sube el archivo al bucket privado: <org>/<conversación>/<uuid>-<nombre>
  async function upload(file: Blob, name: string, mime: string): Promise<Attachment | null> {
    if (file.size > MAX_MB * 1024 * 1024) { setMediaErr(`El archivo supera ${MAX_MB} MB.`); return null; }
    setUploading(true);
    setMediaErr(null);
    const path = `${orgId}/${conversationId}/${crypto.randomUUID()}-${safeName(name)}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, file, { contentType: mime });
    setUploading(false);
    if (error) { setMediaErr(`No se pudo subir: ${error.message}`); return null; }
    return { path, name, mime, preview: mime.startsWith("image/") ? URL.createObjectURL(file) : undefined };
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const a = await upload(f, f.name, baseMime(f.type));
    if (a) setAtt(a);
  }

  async function clearAtt() {
    if (att) {
      if (att.preview) URL.revokeObjectURL(att.preview);
      supabase.storage.from("chat-media").remove([att.path]); // no dejar archivos huérfanos
    }
    setAtt(null);
  }

  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  async function startRec() {
    setMediaErr(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setMediaErr("Tu navegador no permite grabar audio.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      cancelled.current = false;
      mr.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        setRec(null);
        if (cancelled.current || chunks.current.length === 0) return;
        const mime = baseMime(mr.mimeType || type || "audio/webm");
        const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks.current, { type: mime });
        const a = await upload(blob, `nota-de-voz.${ext}`, mime);
        if (a) await onSend("", a); // la nota de voz se envía directamente
      };
      mr.start();
      recorder.current = mr;
      setRec({ seconds: 0 });
      timer.current = setInterval(() => setRec((r) => (r ? { seconds: r.seconds + 1 } : r)), 1000);
    } catch {
      setMediaErr("No se pudo acceder al micrófono. Revisa el permiso del navegador.");
    }
  }
  const stopRec = (send: boolean) => {
    cancelled.current = !send;
    recorder.current?.state === "recording" && recorder.current.stop();
  };
  useEffect(() => () => { cancelled.current = true; stopTimer(); recorder.current?.state === "recording" && recorder.current.stop(); }, []);

  async function submit() {
    const t = text.trim();
    if ((!t && !att) || uploading) return;
    const media = att ?? undefined;
    setText("");
    setAtt(null);
    if (media?.preview) URL.revokeObjectURL(media.preview);
    await onSend(t, media);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showQuick) {
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(matches[idx % matches.length].content); return; }
      if (e.key === "Escape") { setText(""); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  async function saveQuick(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.rpc("save_quick_reply", { p_shortcut: form.shortcut, p_content: form.content });
    if (error) return setErr(error.message);
    setForm({ shortcut: "", content: "" });
    loadQuick();
  }
  async function removeQuick(id: string) {
    const { error } = await supabase.from("quick_replies").delete().eq("id", id);
    if (error) setErr(error.message);
    else loadQuick();
  }

  const tool = "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100";
  const off = "flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-slate-300";
  return (
    <div ref={box} className="relative border-t bg-white p-3">
      {showQuick && (
        <ul className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-52 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl" role="listbox" aria-label="Respuestas rápidas">
          {matches.map((q, i) => (
            <li key={q.id} role="option" aria-selected={i === idx % matches.length}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); insert(q.content); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${i === idx % matches.length ? "bg-indigo-50" : ""}`}>
                <span className="font-semibold text-indigo-700">/{q.shortcut}</span>
                <span className="ml-2 text-slate-500">{q.content.slice(0, 70)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border focus-within:border-indigo-400">
        {(att || uploading) && (
          <div className="flex items-center gap-3 border-b px-3 py-2 text-sm">
            {att?.preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={att.preview} alt="" className="h-12 w-12 rounded object-cover" />
              : <span className="text-2xl" aria-hidden>{att?.mime.startsWith("audio/") ? "🎤" : att?.mime.startsWith("video/") ? "🎬" : "📄"}</span>}
            <span className="min-w-0 flex-1 truncate">{uploading ? "Subiendo archivo…" : att?.name}</span>
            {att && <button type="button" onClick={clearAtt} aria-label="Quitar archivo" className="text-slate-400 hover:text-red-600">✕</button>}
          </div>
        )}
        <div className="flex items-start gap-2 p-2">
          <textarea ref={area} value={text} rows={2} onChange={(e) => { setText(e.target.value); setIdx(0); }} onKeyDown={onKeyDown}
            placeholder={att ? "Añade un comentario (opcional)…" : "Escribe / para las respuestas rápidas…"} aria-label="Mensaje"
            className="min-h-[3rem] flex-1 resize-none px-2 py-1 text-sm outline-none" />
          <button type="button" onClick={submit} disabled={(!text.trim() && !att) || uploading} aria-label="Enviar mensaje"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white disabled:opacity-40">➤</button>
        </div>
        {rec && (
          <div className="flex items-center gap-3 border-t bg-red-50 px-3 py-2 text-sm" role="status" aria-live="polite">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden />
            <span className="font-medium text-red-700">Grabando {String(Math.floor(rec.seconds / 60)).padStart(2, "0")}:{String(rec.seconds % 60).padStart(2, "0")}</span>
            <button type="button" onClick={() => stopRec(false)} className="ml-auto rounded-lg border px-3 py-1 text-xs">Cancelar</button>
            <button type="button" onClick={() => stopRec(true)} className="rounded-lg bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">Enviar nota</button>
          </div>
        )}
        <div className="flex items-center gap-1 border-t px-2 py-1.5">
          <button type="button" onClick={() => wrap("*")} aria-label="Negrita" title="Negrita" className={`${tool} font-bold`}>B</button>
          <button type="button" onClick={() => wrap("_")} aria-label="Cursiva" title="Cursiva" className={`${tool} italic`}>I</button>
          <button type="button" onClick={() => wrap("~")} aria-label="Tachado" title="Tachado" className={`${tool} line-through`}>S</button>
          <button type="button" onClick={() => setPop(pop === "emoji" ? null : "emoji")} aria-label="Emojis" title="Emojis" className={tool}>😊</button>
          <button type="button" onClick={() => setPop(pop === "quick" ? null : "quick")} aria-label="Respuestas rápidas" title="Respuestas rápidas" className={tool}>⚡</button>
          <input ref={fileInput} type="file" hidden onChange={onPick}
            accept="image/*,audio/*,video/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || !!rec} aria-label="Adjuntar archivo" title="Adjuntar archivo (máx. 10 MB)" className={tool}>📎</button>
          <button type="button" onClick={startRec} disabled={uploading || !!rec} aria-label="Grabar nota de voz" title="Grabar nota de voz" className={tool}>🎤</button>
          <span className="ml-auto truncate text-xs text-slate-500" title="Canal desde el que se envía">{channelName}</span>
        </div>
      </div>

      {mediaErr && <p className="mt-2 text-xs text-red-600" role="alert">{mediaErr}</p>}
      {pop === "emoji" && (
        <div className="absolute bottom-24 left-3 z-20 grid w-64 grid-cols-8 gap-1 rounded-xl border bg-white p-2 shadow-xl">
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => addEmoji(e)} className="rounded p-1 text-lg hover:bg-slate-100">{e}</button>)}
        </div>
      )}
      {pop === "quick" && (
        <div className="absolute bottom-24 left-3 z-20 w-80 rounded-xl border bg-white p-3 shadow-xl">
          <p className="mb-2 text-sm font-semibold">Respuestas rápidas</p>
          <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto text-sm">
            {quick.length === 0 && <li className="text-xs text-slate-500">Aún no hay. {isAdmin ? "Crea la primera abajo." : "Pídele a un administrador que las cree."}</li>}
            {quick.map((q) => (
              <li key={q.id} className="flex items-start gap-2">
                <button type="button" onClick={() => { insert(q.content); setPop(null); }} className="min-w-0 flex-1 text-left">
                  <span className="font-semibold text-indigo-700">/{q.shortcut}</span>
                  <span className="block truncate text-xs text-slate-500">{q.content}</span>
                </button>
                {isAdmin && <button type="button" aria-label={`Eliminar /${q.shortcut}`} onClick={() => removeQuick(q.id)} className="text-slate-400 hover:text-red-600">✕</button>}
              </li>
            ))}
          </ul>
          {isAdmin && (
            <form onSubmit={saveQuick} className="space-y-1 border-t pt-2">
              <input required placeholder="atajo (ej. precios)" value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
              <textarea required rows={2} maxLength={1000} placeholder="Mensaje" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
              <button className="w-full rounded bg-indigo-600 py-1.5 text-sm font-medium text-white">Guardar</button>
            </form>
          )}
          {err && <p className="mt-1 text-xs text-red-600" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
