"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TRIGGERS } from "../types";
import { META, NODE_W, validateStep, type Cfg, type Kind, type NoteNodeData, type PickerData, type StepNodeData, type TriggerData } from "./model";
import { PickerBody, StepForm } from "./panels";

// Lo que los nodos necesitan del editor
export type FlowCtx = {
  openAdd: (sourceId: string, handle: string) => void;
  pick: (kind: Kind) => void;
  closePicker: () => void;
  openTrigger: () => void;
  setConfig: (id: string, config: Cfg) => void;
  remove: (id: string) => void;
  hasEdge: (sourceId: string, handle: string) => boolean;
  setNoteText: (id: string, text: string) => void;
  agents: { id: string; name: string }[];
  orgId: string;
  canEdit: boolean;
};
export const FlowContext = createContext<FlowCtx | null>(null);
const useFlow = () => useContext(FlowContext)!;

// Fila "Próximo paso" con su punto de conexión. Se arrastra desde el punto hacia el lienzo para crear el siguiente paso
// (o se pulsa el "+"). Mientras no haya nada conectado se muestra el "+".
function OutRow({ id, handle, label, color, pad = 16 }: { id: string; handle: string; label: string; color?: string; pad?: number }) {
  const f = useFlow();
  const used = f.hasEdge(id, handle);
  return (
    <div className="relative mt-3 flex h-7 items-center justify-end pr-6 text-[11px]" style={{ marginLeft: -pad, marginRight: -pad }}>
      <span className={color ?? "text-slate-500"}>{label}</span>
      {!used && f.canEdit && (
        <button onClick={(e) => { e.stopPropagation(); f.openAdd(id, handle); }} aria-label={`Añadir paso: ${label}`} title={`Añadir paso (${label})`}
          className="nodrag absolute right-[-44px] flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold leading-none text-white shadow hover:bg-indigo-600">+</button>
      )}
      <Handle id={handle} type="source" position={Position.Right} aria-label={label}
        className="!right-[-8px] !h-4 !w-4 !border-2 !border-white !bg-indigo-400" />
    </div>
  );
}

export function TriggerNode({ id, data }: NodeProps) {
  const f = useFlow();
  const d = data as TriggerData;
  const t = TRIGGERS[d.trigger_type];
  const cond = String(d.conditions[t.field] ?? "").trim();
  return (
    <div className="rounded-2xl bg-indigo-500 p-5 text-white shadow-lg" style={{ width: 300 }}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-lg" aria-hidden>▷</span>
        <h3 className="text-lg font-semibold leading-tight">Crea una automatización</h3>
      </div>
      <p className="mt-3 text-sm text-indigo-100">Este es el inicio del flujo. Se ejecuta cuando ocurre el disparador que asignes.</p>
      <div className="mt-4 border-t border-white/30">
        <OutRow id={id} handle="next" label="Próximo paso" color="text-indigo-100" pad={20} />
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

// Cada paso es una ventanita: título, su formulario y la(s) salida(s)
export function StepNode({ id, data, selected }: NodeProps) {
  const f = useFlow();
  const d = data as StepNodeData;
  const m = META[d.kind];
  return (
    <div style={{ width: NODE_W }}
      className={`rounded-2xl border bg-white p-4 shadow-md ${selected ? "ring-2 ring-indigo-300" : ""} ${d.invalid ? "border-red-400 ring-2 ring-red-200" : ""}`}>
      <Handle type="target" position={Position.Left} className="!left-[-8px] !h-4 !w-4 !border-2 !border-white !bg-slate-400" aria-label="Entrada" />
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl text-indigo-600" aria-hidden>{m.icon}</span>
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{m.label}</h3>
        {f.canEdit && (
          <button onClick={() => f.remove(id)} aria-label={`Eliminar ${m.label}`} title="Eliminar paso" className="nodrag text-slate-300 hover:text-red-600">✕</button>
        )}
      </div>

      <StepForm kind={d.kind} config={d.config} agents={f.agents} orgId={f.orgId} canEdit={f.canEdit} onChange={(c) => f.setConfig(id, c)} />
      {d.invalid && <p className="mt-2 text-xs text-red-600" role="alert">Completa este paso: {validateStep(d.kind, d.config)}.</p>}

      {d.kind === "condition" ? (
        <>
          <OutRow id={id} handle="yes" label="Sí" color="font-semibold text-emerald-600" />
          <OutRow id={id} handle="no" label="No" color="font-semibold text-amber-600" />
        </>
      ) : (
        <OutRow id={id} handle="next" label="Próximo paso" />
      )}
    </div>
  );
}

// La ventanita "¿Qué desea agregar?": nace al arrastrar desde una salida (o al pulsar "+") y queda unida con una línea
export function PickerNode({ data }: NodeProps) {
  const f = useFlow();
  void (data as PickerData);
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-xl" style={{ width: 360 }} role="dialog" aria-label="¿Qué desea agregar?">
      <Handle type="target" position={Position.Left} isConnectable={false} className="!left-[-8px] !h-4 !w-4 !border-2 !border-white !bg-slate-400" />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">¿Qué desea agregar?</h2>
        <button onClick={f.closePicker} aria-label="Cerrar" className="nodrag text-xl leading-none text-slate-500 hover:text-slate-900">✕</button>
      </div>
      <PickerBody onPick={f.pick} />
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
