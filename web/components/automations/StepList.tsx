"use client";

import { STEP_LABELS, type Step } from "./types";

const input = "w-full rounded border px-2 py-1 text-sm";

const blank = (type: Step["type"]): Step =>
  type === "condition"
    ? { type, config: { field: "message_contains", value: "" }, then: [], else: [] }
    : { type, config: type === "http_request" ? { method: "POST", url: "" } : type === "wait" ? { minutes: 5 } : {} };

export function StepList({ steps, onChange }: { steps: Step[]; onChange: (s: Step[]) => void }) {
  const update = (i: number, patch: Partial<Step>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setCfg = (i: number, k: string, v: string | number) =>
    update(i, { config: { ...steps[i].config, [k]: v } });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="rounded-lg border bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-500">{i + 1}. {STEP_LABELS[s.type]}</span>
            <span className="ml-auto flex gap-1 text-sm">
              <button type="button" aria-label="Subir" onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label="Bajar" onClick={() => move(i, 1)}>↓</button>
              <button type="button" aria-label="Eliminar paso" onClick={() => onChange(steps.filter((_, j) => j !== i))}>✕</button>
            </span>
          </div>

          {s.type === "send_message" && (
            <textarea rows={2} className={input} placeholder="Texto. Variables: {{name}} {{phone}}"
              value={String(s.config.text ?? "")} onChange={(e) => setCfg(i, "text", e.target.value)} />
          )}
          {s.type === "add_tag" && (
            <input className={input} placeholder="Nombre de la etiqueta"
              value={String(s.config.name ?? "")} onChange={(e) => setCfg(i, "name", e.target.value)} />
          )}
          {s.type === "move_stage" && (
            <input className={input} placeholder="Nombre de la etapa (ej. Propuesta)"
              value={String(s.config.stage_name ?? "")} onChange={(e) => setCfg(i, "stage_name", e.target.value)} />
          )}
          {s.type === "http_request" && (
            <div className="flex gap-2">
              <select className="rounded border px-2 py-1 text-sm" value={String(s.config.method ?? "POST")}
                onChange={(e) => setCfg(i, "method", e.target.value)}>
                {["POST", "GET", "PUT", "PATCH"].map((m) => <option key={m}>{m}</option>)}
              </select>
              <input className={input} placeholder="https://…" value={String(s.config.url ?? "")}
                onChange={(e) => setCfg(i, "url", e.target.value)} />
            </div>
          )}
          {s.type === "wait" && (
            <label className="flex items-center gap-2 text-sm">
              Esperar
              <input type="number" min={1} className="w-24 rounded border px-2 py-1 text-sm"
                value={Number(s.config.minutes ?? 1)} onChange={(e) => setCfg(i, "minutes", Number(e.target.value))} />
              minutos
            </label>
          )}
          {s.type === "condition" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select className="rounded border px-2 py-1 text-sm" value={String(s.config.field)}
                  onChange={(e) => setCfg(i, "field", e.target.value)}>
                  <option value="message_contains">Mensaje contiene</option>
                  <option value="has_tag">Tiene la etiqueta</option>
                </select>
                <input className={input} value={String(s.config.value ?? "")}
                  onChange={(e) => setCfg(i, "value", e.target.value)} />
              </div>
              <div className="border-l-2 border-emerald-400 pl-3">
                <p className="mb-1 text-xs text-emerald-700">Si se cumple</p>
                <StepList steps={s.then ?? []} onChange={(t) => update(i, { then: t })} />
              </div>
              <div className="border-l-2 border-amber-400 pl-3">
                <p className="mb-1 text-xs text-amber-700">Si no</p>
                <StepList steps={s.else ?? []} onChange={(t) => update(i, { else: t })} />
              </div>
            </div>
          )}
        </div>
      ))}
      <select
        aria-label="Añadir paso"
        className="rounded border px-2 py-1 text-sm"
        value=""
        onChange={(e) => e.target.value && onChange([...steps, blank(e.target.value as Step["type"])])}
      >
        <option value="">+ Añadir paso…</option>
        {(Object.keys(STEP_LABELS) as Step["type"][]).map((t) => (
          <option key={t} value={t}>{STEP_LABELS[t]}</option>
        ))}
      </select>
    </div>
  );
}
