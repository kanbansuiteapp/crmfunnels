"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";

type Tag = { id: string; name: string; color: string };
type Field = { id: string; name: string; type: "text" | "number" | "url" | "date"; value: string };
type Contact = { name: string | null; phone_number: string; email: string | null; notes: string | null };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-t py-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-semibold">
        {title}<span aria-hidden className="text-slate-400">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

export function ContactPanel({
  contactId, onClose, onChanged,
}: { contactId: string; onClose: () => void; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [contact, setContact] = useState<Contact | null>(null);
  const [assigned, setAssigned] = useState<Tag[]>([]);
  const [orgTags, setOrgTags] = useState<Tag[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [editing, setEditing] = useState<"name" | "email" | null>(null);
  const [draft, setDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [showNewField, setShowNewField] = useState(false);
  const [newField, setNewField] = useState({ name: "", type: "text" as Field["type"] });
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, t, all, f, defs] = await Promise.all([
      supabase.from("contacts").select("name, phone_number, email, notes").eq("id", contactId).single(),
      supabase.from("contact_tags").select("tag:tags(id, name, color)").eq("contact_id", contactId),
      supabase.from("tags").select("id, name, color").order("name"),
      supabase.from("custom_field_values").select("field_id, value").eq("contact_id", contactId),
      supabase.from("custom_field_defs").select("id, name, type").order("name"),
    ]);
    if (c.data) { setContact(c.data as Contact); setNotes(c.data.notes ?? ""); }
    setAssigned((t.data ?? []).map((r) => (r as unknown as { tag: Tag }).tag).filter(Boolean));
    setOrgTags((all.data ?? []) as Tag[]);
    const values = new Map((f.data ?? []).map((v) => [v.field_id, v.value as string]));
    setFields((defs.data ?? []).map((d) => ({ ...(d as Omit<Field, "value">), value: values.get(d.id) ?? "" })));
  }, [supabase, contactId]);

  useEffect(() => { load(); }, [load]);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    setErr(error?.message ?? null);
    if (!error) load();
    return !error;
  }

  async function saveContact(patch: Partial<Pick<Contact, "name" | "email" | "notes">>) {
    const ok = await run(supabase.from("contacts").update(patch).eq("id", contactId));
    if (ok) onChanged();
    return ok;
  }

  async function commitEdit() {
    if (!editing) return;
    const value = draft.trim();
    if (editing === "name" && !value) return setEditing(null);
    const ok = await saveContact({ [editing]: value || null });
    if (ok) setEditing(null);
  }

  const addTag = (name: string) => run(supabase.rpc("add_contact_tag", { p_contact_id: contactId, p_name: name }));
  const saveField = (f: Pick<Field, "name" | "type" | "value">) =>
    run(supabase.rpc("set_custom_field", { p_contact_id: contactId, p_name: f.name, p_type: f.type, p_value: f.value }));

  if (!contact) return <aside className="w-[340px] shrink-0 rounded-xl border bg-white p-5 text-sm text-slate-400">Cargando…</aside>;

  const label = contact.name ?? contact.phone_number;
  const free = orgTags.filter((t) => !assigned.some((a) => a.id === t.id));
  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  const pencil = "ml-1 text-slate-400 hover:text-indigo-600";

  return (
    <aside className="w-[340px] shrink-0 overflow-y-auto rounded-xl border bg-white p-5" aria-label="Información del contacto">
      <div className="flex items-start gap-3 pb-4">
        <Avatar name={label} size={52} />
        <div className="min-w-0 flex-1">
          {editing === "name" ? (
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitEdit}
              onKeyDown={(e) => e.key === "Enter" && commitEdit()} aria-label="Nombre" className={input} />
          ) : (
            <p className="truncate font-semibold">
              {label}
              <button onClick={() => { setDraft(contact.name ?? ""); setEditing("name"); }} aria-label="Editar nombre" className={pencil}>✎</button>
            </p>
          )}
          <p className="text-sm text-indigo-600">{contact.phone_number}</p>
          {editing === "email" ? (
            <input autoFocus type="email" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitEdit}
              onKeyDown={(e) => e.key === "Enter" && commitEdit()} aria-label="Correo electrónico" className={`${input} mt-1`} />
          ) : (
            <p className="truncate text-sm text-slate-500">
              {contact.email ?? "Sin correo electrónico"}
              <button onClick={() => { setDraft(contact.email ?? ""); setEditing("email"); }} aria-label="Editar correo" className={pencil}>✎</button>
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Cerrar panel" className="text-xl leading-none text-slate-500 hover:text-slate-900">✕</button>
      </div>

      <Section title="Tags">
        <select aria-label="Seleccionar tag" value="" onChange={(e) => e.target.value && addTag(e.target.value)} className={input}>
          <option value="">Seleccionar tag</option>
          {free.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) addTag(newTag.trim()).then((ok) => ok && setNewTag("")); }} className="mt-2 flex gap-2">
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="o crea una nueva" aria-label="Nueva tag" className={`${input} min-w-0 flex-1`} />
          <button className="rounded-lg bg-indigo-600 px-3 text-sm text-white" aria-label="Crear tag">+</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {assigned.length === 0 && <p className="text-sm text-slate-500">No hay tags asignadas a este contacto</p>}
          {assigned.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-white" style={{ background: t.color }}>
              {t.name}
              <button aria-label={`Quitar ${t.name}`} onClick={() => run(supabase.rpc("remove_contact_tag", { p_contact_id: contactId, p_tag_id: t.id }))}>×</button>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Campos customizados">
        {fields.length === 0 && !showNewField && <p className="text-sm text-slate-500">Este contacto no tiene campos personalizados</p>}
        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.id} className="block text-xs text-slate-600">
              {f.name}
              <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} defaultValue={f.value} key={`${f.id}:${f.value}`}
                onBlur={(e) => e.target.value !== f.value && saveField({ ...f, value: e.target.value })} className={`${input} mt-0.5`} />
            </label>
          ))}
        </div>
        {showNewField ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (await saveField({ ...newField, value: "" })) { setNewField({ name: "", type: "text" }); setShowNewField(false); } }} className="mt-3 flex gap-1">
            <input required autoFocus value={newField.name} onChange={(e) => setNewField({ ...newField, name: e.target.value })} placeholder="Nombre del campo" className={`${input} min-w-0 flex-1`} />
            <select value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value as Field["type"] })} className="rounded-lg border px-2 text-sm">
              <option value="text">Texto</option><option value="number">Número</option><option value="url">URL</option><option value="date">Fecha</option>
            </select>
            <button className="rounded-lg bg-indigo-600 px-3 text-sm text-white">+</button>
          </form>
        ) : (
          <button onClick={() => setShowNewField(true)} className="mt-3 ml-auto flex items-center gap-1 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700">
            + Añadir
          </button>
        )}
      </Section>

      <section className="border-t py-4">
        <h3 className="mb-2 text-sm font-semibold">Notas del contacto</h3>
        <textarea rows={4} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (contact.notes ?? "") && saveContact({ notes: notes.trim() || null })}
          placeholder="Escribe una nota para este contacto…" aria-label="Notas del contacto"
          className="w-full resize-none rounded-lg border bg-slate-50 px-3 py-2 text-sm" />
        <p className="mt-1 text-xs text-slate-400">Se guarda al salir del cuadro.</p>
      </section>
      {err && <p className="text-xs text-red-600" role="alert">{err}</p>}
    </aside>
  );
}
