"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Stage } from "./types";

type Props = {
  pipelineId: string;
  stages: Stage[];
  onCreated: () => void;
  onClose: () => void;
};

export function NewDealForm({ pipelineId, stages, onCreated, onClose }: Props) {
  const ordered = [...stages].sort((a, b) => a.order_position - b.order_position);
  const [title, setTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(ordered[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("create_deal", {
      p_pipeline_id: pipelineId,
      p_stage_id: stageId,
      p_title: title,
      p_value: Number(value) || 0,
      p_contact_name: contactName,
      p_phone: phone,
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    onCreated();
    onClose();
  }

  const input = "rounded border px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-white p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold">Nuevo deal</h2>
        <input required placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        <input placeholder="Nombre del contacto" value={contactName} onChange={(e) => setContactName(e.target.value)} className={input} />
        <input required placeholder="Teléfono (+51…)" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
        <input type="number" min="0" step="0.01" placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
        <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={input}>
          {ordered.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-2 text-sm">Cancelar</button>
          <button disabled={busy} className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            Crear
          </button>
        </div>
      </form>
    </div>
  );
}
