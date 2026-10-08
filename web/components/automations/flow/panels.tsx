"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STEP_LABELS, type RunWithLog, type Step } from "../types";
import { META, UNITS, UNIT_LABEL, type Cfg, type Kind, type Unit } from "./model";

const input = "nodrag w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400";
const label = "mb-1 block text-sm font-semibold";

// ───────────── formulario dentro de cada ventanita (nodo) ─────────────
const MODES = [
  { id: "text", label: "Texto", icon: "💬", accept: "" },
  { id: "media", label: "Multimedia", icon: "🖼️", accept: "image/*,video/*" },
  { id: "audio", label: "Audio", icon: "🔊", accept: "audio/*" },
  { id: "document", label: "Documento", icon: "📄", accept: "application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" },
] as const;
const MAX_MB = 10;

function MessageForm({ c, set, orgId, canEdit }: { c: Cfg; set: (p: Cfg) => void; orgId: string; canEdit: boolean }) {
  const mode = String(c.mode ?? "text");
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = MODES.find((m) => m.id === mode) ?? MODES[0];

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`El archivo supera ${MAX_MB} MB.`);
    setBusy(true);
    setErr(null);
    const path = `${orgId}/automations/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    const { error } = await createClient().storage.from("chat-media").upload(path, f, { contentType: (f.type || "application/octet-stream").split(";")[0] });
    setBusy(false);
    if (error) return setErr(`No se pudo subir: ${error.message}`);
    set({ media_path: path, media_name: f.name, media_mime: f.type });
  }

  function removeFile() {
    if (c.media_path) createClient().storage.from("chat-media").remove([String(c.media_path)]);
    set({ media_path: "", media_name: "", media_mime: "" });
  }

  return (
    <div>
      <p className={label}>Tipo de mensaje</p>
      <div role="tablist" aria-label="Tipo de mensaje" className="nodrag mb-3 grid grid-cols-5 divide-x overflow-hidden rounded-lg border text-center text-[11px]">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} disabled={!canEdit}
            onClick={() => mode !== m.id && set({ mode: m.id, media_path: "", media_name: "", media_mime: "" })}
            className={`px-1 py-2 ${mode === m.id ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>
            <span className="block text-base" aria-hidden>{m.icon}</span>{m.label}
          </button>
        ))}
        <button type="button" disabled title="Próximamente" className="cursor-not-allowed px-1 py-2 text-slate-300">
          <span className="block text-base" aria-hidden>👤</span>Contacto
        </button>
      </div>

      {mode !== "text" && (
        <div className="mb-3">
          {c.media_path ? (
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
              <span aria-hidden>{active.icon}</span>
              <span className="min-w-0 flex-1 truncate">{String(c.media_name ?? "archivo")}</span>
              {canEdit && <button type="button" onClick={removeFile} aria-label="Quitar archivo" className="nodrag text-slate-400 hover:text-red-600">✕</button>}
            </div>
          ) : (
            <>
              <input ref={file} type="file" hidden accept={active.accept} onChange={pick} />
              <button type="button" disabled={busy || !canEdit} onClick={() => file.current?.click()}
                className="nodrag w-full rounded-lg border-2 border-dashed py-4 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-60">
                {busy ? "Subiendo…" : `Subir ${active.label.toLowerCase()} (máx. ${MAX_MB} MB)`}
              </button>
            </>
          )}
          {err && <p className="mt-1 text-xs text-red-600" role="alert">{err}</p>}
        </div>
      )}

      {mode !== "audio" && (
        <>
          <textarea rows={mode === "text" ? 4 : 2} maxLength={1000} value={String(c.text ?? "")} disabled={!canEdit} onChange={(e) => set({ text: e.target.value })}
            placeholder={mode === "text" ? "Hola {{name}}, gracias por escribirnos…" : "Comentario (opcional)"} aria-label={mode === "text" ? "Mensaje" : "Comentario"}
            className={`${input} nowheel resize-none`} />
          {mode === "text" && <p className="mt-1 text-xs text-slate-500">Variables: <code>{"{{name}}"}</code> y <code>{"{{phone}}"}</code>. {String(c.text ?? "").length}/1000</p>}
        </>
      )}
    </div>
  );
}

export function StepForm({
  kind, config, agents, orgId, canEdit, onChange,
}: { kind: Kind; config: Cfg; agents: { id: string; name: string }[]; orgId: string; canEdit: boolean; onChange: (c: Cfg) => void }) {
  const c = config;
  const set = (patch: Cfg) => onChange({ ...c, ...patch });
  const id = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  return (
    <fieldset disabled={!canEdit} className="space-y-3">
      {kind === "send_message" && <MessageForm c={c} set={set} orgId={orgId} canEdit={canEdit} />}
      {kind === "add_tag" && (
        <div>
          <label htmlFor={`t${id}`} className={label}>Etiqueta</label>
          <input id={`t${id}`} value={String(c.name ?? "")} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Interesado" className={input} />
          <p className="mt-1 text-xs text-slate-500">Si no existe, se crea.</p>
        </div>
      )}
      {kind === "move_stage" && (
        <div>
          <label htmlFor={`s${id}`} className={label}>Nombre de la etapa</label>
          <input id={`s${id}`} value={String(c.stage_name ?? "")} onChange={(e) => set({ stage_name: e.target.value })} placeholder="Ej. Propuesta" className={input} />
          <p className="mt-1 text-xs text-slate-500">Se usa el primer pipeline. Si el contacto no tiene deal, se crea.</p>
        </div>
      )}
      {kind === "http_request" && (
        <>
          <div className="flex gap-2">
            <select aria-label="Método" value={String(c.method ?? "POST")} onChange={(e) => set({ method: e.target.value })} className={`${input} max-w-[110px]`}>
              {["POST", "GET", "PUT", "PATCH"].map((x) => <option key={x}>{x}</option>)}
            </select>
            <input aria-label="URL" type="url" value={String(c.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" className={input} />
          </div>
          <p className="text-xs text-slate-500">Solo https hacia direcciones públicas.</p>
        </>
      )}
      {kind === "wait" && (
        <div>
          <p className={label}>Esperar</p>
          <div className="flex gap-2">
            <input aria-label="Cantidad" type="number" min={1} value={Number(c.amount ?? 1)}
              onChange={(e) => { const a = Math.max(1, Number(e.target.value) || 1); set({ amount: a, minutes: a * UNITS[(c.unit as Unit) ?? "min"] }); }} className={input} />
            <select aria-label="Unidad" value={String(c.unit ?? "min")}
              onChange={(e) => { const u = e.target.value as Unit; set({ unit: u, minutes: Number(c.amount ?? 1) * UNITS[u] }); }} className={`${input} max-w-[130px]`}>
              {(Object.keys(UNITS) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
            </select>
          </div>
          <p className="mt-1 text-xs text-slate-500">Se reanuda con una precisión de hasta un minuto.</p>
        </div>
      )}
      {kind === "condition" && (
        <>
          <div className="flex gap-2">
            <select aria-label="Condición" value={String(c.field ?? "message_contains")} onChange={(e) => set({ field: e.target.value })} className={input}>
              <option value="message_contains">El mensaje contiene</option>
              <option value="has_tag">El contacto tiene la etiqueta</option>
            </select>
            <input aria-label="Valor" value={String(c.value ?? "")} onChange={(e) => set({ value: e.target.value })} placeholder="Valor" className={input} />
          </div>
          <p className="text-xs text-slate-500">Conecta la salida <b className="text-emerald-600">Sí</b> y la salida <b className="text-amber-600">No</b>.</p>
        </>
      )}
      {kind === "assign" && (
        <select aria-label="Agente" value={String(c.agent_id ?? "")} onChange={(e) => set({ agent_id: e.target.value })} className={input}>
          <option value="" disabled>Selecciona un agente</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      {(kind === "rotator" || kind === "ai") && <p className="text-sm text-slate-600">{META[kind].blurb} No necesita configuración.</p>}
    </fieldset>
  );
}

// ───────────── contenido de la ventanita "¿Qué desea agregar?" ─────────────
function Chip({ kind, onPick, disabled, text, icon }: { kind?: Kind; onPick?: () => void; disabled?: boolean; text?: string; icon?: string }) {
  const m = kind ? META[kind] : null;
  return (
    <button type="button" onClick={onPick} disabled={disabled} title={disabled ? "Próximamente" : m?.blurb}
      className="nodrag flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-slate-100">
      <span aria-hidden>{icon ?? m?.icon}</span>{text ?? m?.label}
    </button>
  );
}

export function PickerBody({ onPick }: { onPick: (k: Kind) => void }) {
  const [action, setAction] = useState(false);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Texto</h3>
      <div className="mb-4 flex flex-wrap gap-2"><Chip kind="send_message" onPick={() => onPick("send_message")} /></div>

      <h3 className="mb-2 text-sm font-semibold">Preguntas</h3>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip text="Múltiple" icon="❔" disabled />
        <Chip text="Simple" icon="❔" disabled />
      </div>

      <h3 className="mb-2 text-sm font-semibold">Acciones</h3>
      <div className="flex flex-wrap gap-2">
        <Chip kind="wait" onPick={() => onPick("wait")} />
        <Chip text="Realizar acción" icon="⚡" onPick={() => setAction(!action)} />
        {action && (
          <div className="flex w-full flex-wrap gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2">
            <Chip kind="add_tag" onPick={() => onPick("add_tag")} />
            <Chip kind="move_stage" onPick={() => onPick("move_stage")} />
            <Chip kind="http_request" onPick={() => onPick("http_request")} />
          </div>
        )}
        <Chip kind="assign" onPick={() => onPick("assign")} />
        <Chip kind="condition" onPick={() => onPick("condition")} />
        <Chip text="Iniciar automatización" icon="➡️" disabled />
        <Chip kind="rotator" onPick={() => onPick("rotator")} />
        <Chip text="Templates" icon="📋" disabled />
        <Chip kind="ai" onPick={() => onPick("ai")} />
      </div>
    </div>
  );
}

// ───────────── ejecuciones (panel lateral) ─────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "Completada", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Falló", cls: "bg-red-100 text-red-800" },
  waiting: { label: "En espera", cls: "bg-amber-100 text-amber-800" },
  running: { label: "Ejecutando", cls: "bg-sky-100 text-sky-800" },
};

export function RunsPanel({ runs, onClose }: { runs: RunWithLog[]; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const describe = (s: RunWithLog["log"][number]) =>
    `${s.ok === false ? "✗" : "✓"} ${STEP_LABELS[s.step as Step["type"]] ?? (s.step ? META[s.step as Kind]?.label ?? s.step : "Paso")}${s.detail ? ` — ${s.detail}` : ""}${s.error ? ` — ${s.error}` : ""}${s.step === "condition" ? ` — ${s.result ? "se cumple" : "no se cumple"}` : ""}${s.step === "wait" ? ` — ${s.minutes} min` : ""}`;
  return (
    <aside className="absolute right-20 top-4 z-10 max-h-[calc(100%-2rem)] w-[360px] overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl" aria-label="Ejecuciones recientes">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ejecuciones recientes</h2>
        <button onClick={onClose} aria-label="Cerrar panel" className="text-xl leading-none text-slate-500 hover:text-slate-900">✕</button>
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {runs.length === 0 && <li className="p-4 text-slate-500">Todavía no se ha ejecutado.</li>}
        {runs.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50">
              <span className="text-slate-600">{new Date(r.created_at).toLocaleString("es")}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${(STATUS[r.status] ?? STATUS.running).cls}`}>{(STATUS[r.status] ?? STATUS.running).label}</span>
            </button>
            {open === r.id && (
              <ol className="space-y-1 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                {(r.log ?? []).length === 0 && <li>Sin pasos registrados.</li>}
                {(r.log ?? []).map((s, i) => <li key={i}>{describe(s)}</li>)}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
