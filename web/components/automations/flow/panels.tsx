"use client";

import { useState } from "react";
import { STEP_LABELS, TRIGGERS, type RunWithLog, type Step, type Trigger } from "../types";
import { META, UNITS, UNIT_LABEL, type Cfg, type Kind, type StepNodeData, type TriggerData, type Unit } from "./model";

const input = "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400";
const label = "mb-1 block text-sm font-semibold";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="absolute right-20 top-4 z-10 max-h-[calc(100%-2rem)] w-[360px] overflow-y-auto rounded-2xl border bg-white p-5 shadow-xl" aria-label={title}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Cerrar panel" className="text-xl leading-none text-slate-500 hover:text-slate-900">✕</button>
      </div>
      {children}
    </aside>
  );
}

// ───────────── "¿Qué desea agregar?" ─────────────
function Chip({ kind, onPick, disabled, text, icon }: { kind?: Kind; onPick?: () => void; disabled?: boolean; text?: string; icon?: string }) {
  const m = kind ? META[kind] : null;
  return (
    <button type="button" onClick={onPick} disabled={disabled} title={disabled ? "Próximamente" : m?.blurb}
      className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-slate-100">
      <span aria-hidden>{icon ?? m?.icon}</span>{text ?? m?.label}
    </button>
  );
}

export function AddPanel({ onPick, onClose }: { onPick: (k: Kind) => void; onClose: () => void }) {
  const [action, setAction] = useState(false);
  return (
    <Shell title="¿Qué desea agregar?" onClose={onClose}>
      <h3 className="mb-2 text-sm font-semibold">Texto</h3>
      <div className="mb-5 flex flex-wrap gap-2"><Chip kind="send_message" onPick={() => onPick("send_message")} /></div>

      <h3 className="mb-2 text-sm font-semibold">Preguntas</h3>
      <div className="mb-5 flex flex-wrap gap-2">
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
    </Shell>
  );
}

// ───────────── configurar un nodo ─────────────
export function ConfigPanel({
  data, agents, onChange, onDelete, onClose, canEdit,
}: {
  data: StepNodeData; agents: { id: string; name: string }[]; canEdit: boolean;
  onChange: (c: Cfg) => void; onDelete: () => void; onClose: () => void;
}) {
  const c = data.config;
  const set = (patch: Cfg) => onChange({ ...c, ...patch });
  const m = META[data.kind];
  return (
    <Shell title={m.label} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">{m.blurb}</p>
      <fieldset disabled={!canEdit} className="space-y-4">
        {data.kind === "send_message" && (
          <div>
            <label htmlFor="cf-text" className={label}>Mensaje</label>
            <textarea id="cf-text" rows={5} maxLength={1000} value={String(c.text ?? "")} onChange={(e) => set({ text: e.target.value })}
              placeholder="Hola {{name}}, gracias por escribirnos…" className={`${input} resize-none`} />
            <p className="mt-1 text-xs text-slate-500">Variables: <code>{"{{name}}"}</code> y <code>{"{{phone}}"}</code>. {String(c.text ?? "").length}/1000</p>
          </div>
        )}
        {data.kind === "add_tag" && (
          <div>
            <label htmlFor="cf-tag" className={label}>Etiqueta</label>
            <input id="cf-tag" value={String(c.name ?? "")} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Interesado" className={input} />
            <p className="mt-1 text-xs text-slate-500">Si no existe, se crea.</p>
          </div>
        )}
        {data.kind === "move_stage" && (
          <div>
            <label htmlFor="cf-stage" className={label}>Nombre de la etapa</label>
            <input id="cf-stage" value={String(c.stage_name ?? "")} onChange={(e) => set({ stage_name: e.target.value })} placeholder="Ej. Propuesta" className={input} />
            <p className="mt-1 text-xs text-slate-500">Se usa el primer pipeline. Si el contacto no tiene deal, se crea.</p>
          </div>
        )}
        {data.kind === "http_request" && (
          <>
            <div>
              <label htmlFor="cf-method" className={label}>Método</label>
              <select id="cf-method" value={String(c.method ?? "POST")} onChange={(e) => set({ method: e.target.value })} className={input}>
                {["POST", "GET", "PUT", "PATCH"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cf-url" className={label}>URL</label>
              <input id="cf-url" type="url" value={String(c.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" className={input} />
              <p className="mt-1 text-xs text-slate-500">Solo https hacia direcciones públicas.</p>
            </div>
          </>
        )}
        {data.kind === "wait" && (
          <div>
            <label htmlFor="cf-amount" className={label}>Esperar</label>
            <div className="flex gap-2">
              <input id="cf-amount" type="number" min={1} value={Number(c.amount ?? 1)}
                onChange={(e) => { const a = Math.max(1, Number(e.target.value) || 1); set({ amount: a, minutes: a * UNITS[(c.unit as Unit) ?? "min"] }); }} className={input} />
              <select aria-label="Unidad" value={String(c.unit ?? "min")}
                onChange={(e) => { const u = e.target.value as Unit; set({ unit: u, minutes: Number(c.amount ?? 1) * UNITS[u] }); }} className={`${input} max-w-[130px]`}>
                {(Object.keys(UNITS) as Unit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
              </select>
            </div>
            <p className="mt-1 text-xs text-slate-500">El flujo se reanuda con una precisión de hasta un minuto.</p>
          </div>
        )}
        {data.kind === "condition" && (
          <>
            <div>
              <label htmlFor="cf-field" className={label}>Si…</label>
              <select id="cf-field" value={String(c.field ?? "message_contains")} onChange={(e) => set({ field: e.target.value })} className={input}>
                <option value="message_contains">El mensaje contiene</option>
                <option value="has_tag">El contacto tiene la etiqueta</option>
              </select>
            </div>
            <div>
              <label htmlFor="cf-value" className={label}>Valor</label>
              <input id="cf-value" value={String(c.value ?? "")} onChange={(e) => set({ value: e.target.value })} className={input} />
            </div>
            <p className="text-xs text-slate-500">Conecta la salida <b className="text-emerald-600">Sí</b> y la salida <b className="text-amber-600">No</b> a los pasos que seguirán en cada caso.</p>
          </>
        )}
        {data.kind === "assign" && (
          <div>
            <label htmlFor="cf-agent" className={label}>Agente</label>
            <select id="cf-agent" value={String(c.agent_id ?? "")} onChange={(e) => set({ agent_id: e.target.value })} className={input}>
              <option value="" disabled>Selecciona un agente</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {(data.kind === "rotator" || data.kind === "ai") && <p className="text-sm text-slate-600">Este paso no necesita configuración.</p>}
      </fieldset>
      {canEdit && (
        <button onClick={onDelete} className="mt-6 w-full rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Eliminar este paso</button>
      )}
    </Shell>
  );
}

// ───────────── disparador ─────────────
export function TriggerPanel({ data, onChange, onClose, canEdit }: { data: TriggerData; onChange: (d: TriggerData) => void; onClose: () => void; canEdit: boolean }) {
  const t = TRIGGERS[data.trigger_type];
  return (
    <Shell title="Disparador" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">Elige qué hace que se inicie este flujo.</p>
      <fieldset disabled={!canEdit} className="space-y-2">
        {(Object.keys(TRIGGERS) as Trigger[]).map((k) => (
          <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${data.set && data.trigger_type === k ? "border-indigo-400 bg-indigo-50" : ""}`}>
            <input type="radio" name="trigger" className="accent-indigo-600" checked={data.set && data.trigger_type === k}
              onChange={() => onChange({ ...data, trigger_type: k, conditions: {}, set: true })} />
            {TRIGGERS[k].label}
          </label>
        ))}
      </fieldset>
      {data.set && (
        <div className="mt-4">
          <label htmlFor="tr-cond" className={label}>{data.trigger_type === "inactivity" ? "Horas sin mensajes" : "Condición (opcional)"}</label>
          <input id="tr-cond" disabled={!canEdit} value={String(data.conditions[t.field] ?? "")} placeholder={t.placeholder}
            type={data.trigger_type === "inactivity" ? "number" : "text"} min={1}
            onChange={(e) => onChange({ ...data, conditions: { [t.field]: e.target.value } })} className={input} />
        </div>
      )}
    </Shell>
  );
}

// ───────────── ejecuciones ─────────────
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
    <Shell title="Ejecuciones recientes" onClose={onClose}>
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
    </Shell>
  );
}
