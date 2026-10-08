"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Field, inputCls, Modal, ModalActions } from "@/components/settings/kit";
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

  async function submit() {
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("create_deal", {
      p_pipeline_id: pipelineId,
      p_stage_id: stageId,
      p_title: title.trim(),
      p_value: Number(value) || 0,
      p_contact_name: contactName.trim(),
      p_phone: phone.trim(),
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    onCreated();
    onClose();
  }

  return (
    <Modal title="Nuevo deal" description="Crea una oportunidad de venta y asígnala a una etapa del tablero." onClose={onClose}>
      <Field label="Título" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Venta de curso" className={inputCls} autoFocus />
      </Field>
      <Field label="Nombre del contacto">
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nombre" className={inputCls} />
      </Field>
      <Field label="Teléfono" required>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+51912345678" inputMode="tel" className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor">
          <input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        <Field label="Etapa">
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={inputCls}>
            {ordered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Alert text={msg} />
      <ModalActions onCancel={onClose} onOk={submit} okLabel="Crear" disabled={!title.trim() || !phone.trim()} busy={busy} />
    </Modal>
  );
}
