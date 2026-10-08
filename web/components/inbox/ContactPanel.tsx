"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tag = { id: string; name: string; color: string };
type Field = { id: string; name: string; type: "text" | "number" | "url" | "date"; value: string };

export function ContactPanel({ contactId }: { contactId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [tags, setTags] = useState<Tag[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [tagName, setTagName] = useState("");
  const [newField, setNewField] = useState({ name: "", type: "text" as Field["type"] });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, f, defs] = await Promise.all([
      supabase.from("contact_tags").select("tag:tags(id, name, color)").eq("contact_id", contactId),
      supabase.from("custom_field_values").select("field_id, value").eq("contact_id", contactId),
      supabase.from("custom_field_defs").select("id, name, type").order("name"),
    ]);
    setTags((t.data ?? []).map((r) => (r as unknown as { tag: Tag }).tag).filter(Boolean));
    const values = new Map((f.data ?? []).map((v) => [v.field_id, v.value as string]));
    setFields((defs.data ?? []).map((d) => ({ ...(d as Omit<Field, "value">), value: values.get(d.id) ?? "" })));
  }, [supabase, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    setErr(error?.message ?? null);
    if (!error) load();
    return !error;
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (await run(supabase.rpc("add_contact_tag", { p_contact_id: contactId, p_name: tagName }))) setTagName("");
  }

  const saveField = (f: Pick<Field, "name" | "type" | "value">) =>
    run(supabase.rpc("set_custom_field", {
      p_contact_id: contactId, p_name: f.name, p_type: f.type, p_value: f.value,
    }));

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    // una definición nueva nace al guardar su primer valor; usamos un valor inicial vacío para crearla
    if (await saveField({ ...newField, value: "" })) setNewField({ name: "", type: "text" });
  }

  const input = "rounded border px-2 py-1 text-sm";
  return (
    <aside className="w-64 shrink-0 space-y-5 overflow-y-auto rounded-xl border bg-white p-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Etiquetas</h3>
        <div className="mb-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white" style={{ background: t.color }}>
              {t.name}
              <button aria-label={`Quitar ${t.name}`} onClick={() => run(supabase.rpc("remove_contact_tag", { p_contact_id: contactId, p_tag_id: t.id }))}>×</button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-xs text-slate-500">Sin etiquetas</span>}
        </div>
        <form onSubmit={addTag} className="flex gap-1">
          <input required value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Nueva etiqueta" className={`${input} min-w-0 flex-1`} />
          <button className="rounded bg-sky-600 px-2 text-sm text-white">+</button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Campos</h3>
        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.id} className="block text-xs text-slate-600">
              {f.name}
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                defaultValue={f.value}
                key={`${f.id}:${f.value}`}
                onBlur={(e) => e.target.value !== f.value && saveField({ ...f, value: e.target.value })}
                className={`${input} mt-0.5 w-full`}
              />
            </label>
          ))}
        </div>
        <form onSubmit={addField} className="mt-3 flex gap-1">
          <input required value={newField.name} onChange={(e) => setNewField({ ...newField, name: e.target.value })} placeholder="Nuevo campo" className={`${input} min-w-0 flex-1`} />
          <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value as Field["type"] })} className={input}>
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="url">URL</option>
            <option value="date">Fecha</option>
          </select>
          <button className="rounded bg-sky-600 px-2 text-sm text-white">+</button>
        </form>
      </section>
      {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
    </aside>
  );
}
