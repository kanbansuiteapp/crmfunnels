"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TRIGGERS } from "../types";
import { META, NODE_W, summary, validateStep, type NoteNodeData, type StepNodeData, type TriggerData } from "./model";

// Lo que los nodos necesitan del editor (abrir el panel de "agregar", seleccionar, borrar…)
export type FlowCtx = {
  openAdd: (sourceId: string, handle: string) => void;
  openTrigger: () => void;
  select: (id: string) => void;
  remove: (id: string) => void;
  hasEdge: (sourceId: string, handle: string) => boolean;
  setNoteText: (id: string, text: string) => void;
  agents: { id: string; name: string }[];
  canEdit: boolean;
};
export const FlowContext = createContext<FlowCtx | null>(null);
const useFlow = () => useContext(FlowContext)!;

// Salida de un nodo: el punto de conexión y, si aún no tiene nada conectado, un "+" para añadir el siguiente paso
function Out({ id, handle, label, top }: { id: string; handle: string; label: string; top?: string }) {
  const f = useFlow();
  const used = f.hasEdge(id, handle);
  return (
    <div className="absolute right-0 flex items-center" style={{ top: top ?? "50%", transform: "translate(50%, -50%)" }}>
      <Handle id={handle} type="source" position={Position.Right} style={{ position: "relative", transform: "none", inset: "auto" }}
        className="!h-3.5 !w-3.5 !border-2 !border-white !bg-indigo-400" aria-label={label} />
      {!used && f.canEdit && (
        <button onClick={(e) => { e.stopPropagation(); f.openAdd(id, handle); }} aria-label={`Añadir paso: ${label}`} title={`Añadir paso (${label})`}
          className="nodrag ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold leading-none text-white shadow hover:bg-indigo-600">+</button>
      )}
    </div>
  );
}

export function TriggerNode({ id, data }: NodeProps) {
  const f = useFlow();
  const d = data as TriggerData;
  const t = TRIGGERS[d.trigger_type];
  const cond = String(d.conditions[t.field] ?? "").trim();
  return (
    <div className="rounded-2xl bg-indigo-500 p-5 text-white shadow-lg" style={{ width: NODE_W }}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-lg" aria-hidden>▷</span>
        <h3 className="text-lg font-semibold leading-tight">Crea una automatización</h3>
      </div>
      <p className="mt-3 text-sm text-indigo-100">Este es el inicio del flujo. Se ejecuta cuando ocurre el disparador que asignes.</p>
      <div className="relative mt-4 border-t border-white/30 pt-3">
        <p className="text-right text-[11px] text-indigo-100">Próximo paso</p>
        <Out id={id} handle="next" label="Próximo paso" top="0%" />
      </div>
      <p className="mt-2 text-sm font-semibold">{d.set ? t.label : "Sin disparador asignado"}</p>
      {d.set && cond && <p className="text-xs text-indigo-100">{t.field === "hours" ? `${cond} h sin mensajes` : `«${cond}»`}</p>}
      {f.canEdit && (
        <button onClick={f.openTrigger} className="nodrag mt-3 w-full rounded-lg bg-white py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
          {d.set ? "Cambiar disparador" : "+ Nuevo disparador"}
        </button>
      )}
    </div>
  );
}

export function StepNode({ id, data, selected }: NodeProps) {
  const f = useFlow();
  const d = data as StepNodeData;
  const m = META[d.kind];
  const text = summary(d.kind, d.config, f.agents);
  const problem = validateStep(d.kind, d.config);
  const isCond = d.kind === "condition";
  return (
    <div onClick={() => f.select(id)} style={{ width: NODE_W }}
      className={`relative cursor-pointer rounded-2xl border bg-white p-4 shadow-md ${selected ? "ring-2 ring-indigo-400" : ""} ${d.invalid ? "border-red-400" : ""}`}>
      <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !border-2 !border-white !bg-slate-400" aria-label="Entrada" />
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-lg" aria-hidden>{m.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{m.label}</p>
          <p className={`line-clamp-2 break-words text-xs ${text ? "text-slate-500" : "text-red-500"}`}>{text ?? `Sin configurar: ${problem ?? ""}`}</p>
        </div>
        {f.canEdit && (
          <button onClick={(e) => { e.stopPropagation(); f.remove(id); }} aria-label={`Eliminar ${m.label}`} title="Eliminar paso"
            className="nodrag text-slate-300 hover:text-red-600">✕</button>
        )}
      </div>
      {isCond ? (
        <>
          <div className="mt-3 flex justify-end gap-6 pr-4 text-[11px] font-semibold"><span className="text-emerald-600">Sí</span></div>
          <div className="mt-3 flex justify-end pr-4 text-[11px] font-semibold"><span className="text-amber-600">No</span></div>
          <Out id={id} handle="yes" label="Sí" top="62%" />
          <Out id={id} handle="no" label="No" top="88%" />
        </>
      ) : (
        <Out id={id} handle="next" label="Próximo paso" />
      )}
    </div>
  );
}

export function NoteNode({ id, data }: NodeProps) {
  const f = useFlow();
  const d = data as NoteNodeData;
  return (
    <div className="w-56 rounded-lg bg-amber-200 p-3 shadow-md">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-amber-900">
        Nota
        {f.canEdit && <button onClick={() => f.remove(id)} aria-label="Eliminar nota" className="nodrag">✕</button>}
      </div>
      <textarea value={d.text} onChange={(e) => f.setNoteText(id, e.target.value)} readOnly={!f.canEdit} rows={4} placeholder="Escribe una nota…"
        aria-label="Texto de la nota" className="nodrag nowheel w-full resize-none bg-transparent text-sm text-amber-950 outline-none placeholder:text-amber-700/60" />
    </div>
  );
}
