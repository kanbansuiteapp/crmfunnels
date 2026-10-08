"use client";

import { useEffect, useState } from "react";
import { TRIGGERS, type Trigger } from "../types";
import type { TriggerData } from "./model";

type Option = "none" | Trigger;

const input = "w-full rounded-lg border bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400";
const label = "mb-2 block text-sm font-semibold";

// Ventana "Configurar disparador de automatización" (se abre desde «+ Nuevo disparador»)
export function TriggerModal({
  data, tags, hooks, canEdit, onSave, onClose,
}: {
  data: TriggerData; tags: string[]; hooks: { id: string; name: string }[]; canEdit: boolean;
  onSave: (d: TriggerData) => void; onClose: () => void;
}) {
  const [type, setType] = useState<Option>(data.set ? data.trigger_type : "none");
  const [cond, setCond] = useState<Record<string, string | number>>(data.set ? { ...data.conditions } : {});

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const change = (v: Option) => { setType(v); setCond({}); };
  const set = (k: string, v: string) => setCond((c) => ({ ...c, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (type === "none") return onSave({ ...data, set: false, conditions: {} });
    onSave({ ...data, trigger_type: type, conditions: cond, set: true });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="trig-title"
        className="w-full max-w-[520px] rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 id="trig-title" className="text-xl font-semibold">Configurar disparador de automatización</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-slate-600 hover:text-slate-900">✕</button>
        </div>
        <p className="mb-6 text-sm text-slate-500">Define cuándo y cómo se activará esta automatización.</p>

        <fieldset disabled={!canEdit} className="space-y-5">
          <div>
            <label htmlFor="trig-type" className={label}>Tipo de disparador</label>
            <select id="trig-type" autoFocus value={type} onChange={(e) => change(e.target.value as Option)} className={input}>
              <option value="none">Sin disparador</option>
              <option value="incoming_message">{TRIGGERS.incoming_message.label}</option>
              <option value="tag_added">{TRIGGERS.tag_added.label}</option>
              <option value="webhook">{TRIGGERS.webhook.label}</option>
              <option value="inactivity">{TRIGGERS.inactivity.label}</option>
            </select>
          </div>

          {type === "incoming_message" && (
            <div>
              <label htmlFor="trig-kw" className={label}>Palabra clave <span className="font-normal text-slate-400">(opcional)</span></label>
              <input id="trig-kw" value={String(cond.keyword ?? "")} onChange={(e) => set("keyword", e.target.value)} placeholder="Ej. precio" className={input} />
              <p className="mt-2 text-xs text-slate-500">Se activa cuando el contacto escribe un mensaje que contiene esta palabra. Si la dejas vacía, se activa con cualquier mensaje.</p>
            </div>
          )}

          {type === "tag_added" && (
            <div>
              <label htmlFor="trig-tag" className={label}>Tag <span className="font-normal text-slate-400">(opcional)</span></label>
              <input id="trig-tag" list="trig-tags" value={String(cond.tag_name ?? "")} onChange={(e) => set("tag_name", e.target.value)} placeholder="Selecciona o escribe un tag" className={input} />
              <datalist id="trig-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
              <p className="mt-2 text-xs text-slate-500">Se activa cuando se agrega este tag a un contacto. Sin tag, se activa con cualquiera. Los tags agregados por otra automatización no la disparan.</p>
            </div>
          )}

          {type === "webhook" && (
            <>
              <div>
                <label htmlFor="trig-hook" className={label}>Integración</label>
                <select id="trig-hook" value={String(cond.hook_id ?? "")} onChange={(e) => set("hook_id", e.target.value)} className={input}>
                  <option value="">Cualquier integración</option>
                  {hooks.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                {hooks.length === 0 && <p className="mt-2 text-xs text-slate-500">Aún no tienes integraciones. Crea una en «Webhook de entrada», al final de la lista de automatizaciones.</p>}
              </div>
              <div>
                <label htmlFor="trig-event" className={label}>Evento <span className="font-normal text-slate-400">(opcional)</span></label>
                <input id="trig-event" value={String(cond.event ?? "")} onChange={(e) => set("event", e.target.value)} placeholder="Ej. compra_aprobada" className={input} />
                <p className="mt-2 text-xs text-slate-500">Se activa cuando la plataforma externa envía este evento (campo «event» del webhook).</p>
              </div>
            </>
          )}

          {type === "inactivity" && (
            <div>
              <label htmlFor="trig-hours" className={label}>Horas sin mensajes</label>
              <input id="trig-hours" type="number" min={1} value={String(cond.hours ?? "")} onChange={(e) => set("hours", e.target.value)} placeholder="24" className={input} />
              <p className="mt-2 text-xs text-slate-500">Se activa cuando una conversación abierta lleva ese tiempo sin ningún mensaje.</p>
            </div>
          )}
        </fieldset>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <button type="button" onClick={onClose} className="rounded-lg border-2 border-indigo-500 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">Cancelar</button>
          {canEdit && (
            <button className="rounded-lg bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600">
              {data.set ? "Guardar disparador" : "Agregar disparador"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
