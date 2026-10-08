"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnPrimary, Check, Field, FilterButton, inputCls, Modal, ModalActions, Page, ROW, SearchBox, TABLE, Th, Toolbar, useMe, useSort } from "./kit";

const TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Texto" }, { value: "number", label: "Numérico" }, { value: "date", label: "Fecha" },
  { value: "url", label: "URL" }, { value: "alphanumeric", label: "Alfanumérico" },
];
const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;

type Def = { id: string; name: string; type: string };

function FieldModal({ def, orgId, onClose, onSaved }: { def: Def | null; orgId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(def?.name ?? "");
  const [type, setType] = useState(def?.type ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    const sb = createClient();
    const { error } = def ? await sb.from("custom_field_defs").update({ name: name.trim() }).eq("id", def.id)
      : await sb.from("custom_field_defs").insert({ organization_id: orgId, name: name.trim(), type });
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "Ya existe un campo con ese nombre." : "No se pudo guardar el campo.");
    onSaved();
  };
  return (
    <Modal title={def ? "Editar campo customizado" : "Crear campo customizado"} description={def ? "Cambia el nombre del campo. El tipo no se puede modificar porque ya puede tener valores guardados." : "Asigna el nombre y el tipo de campo para ampliar la información de tus contactos."} onClose={onClose}>
      <Field label="Nombre" required counter={`${name.length}/50`}>
        <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Escribe el nombre" className={inputCls} autoFocus />
      </Field>
      <Field label="Tipo de campo customizado" required>
        <select value={type} disabled={!!def} onChange={(e) => setType(e.target.value)} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-500`}>
          <option value="" disabled>selecciona una opción</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={save} okLabel="Ejecutar acción" disabled={!name.trim() || !type} busy={busy} />
    </Modal>
  );
}

export function FieldsClient() {
  const me = useMe();
  const [rows, setRows] = useState<Def[] | null>(null);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [modal, setModal] = useState<Def | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("custom_field_defs").select("id,name,type").order("name");
    if (error) { setErr("No se pudieron cargar los campos."); setRows([]); return; }
    setRows((data ?? []) as Def[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows ?? []).filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()) && (types.length === 0 || types.includes(d.type)));
  const { sorted, toggle } = useSort(shown, { key: "name", dir: 1 });
  const allOn = sorted.length > 0 && sorted.every((d) => sel.includes(d.id));

  const del = async (ids: string[]) => {
    if (!confirm(`¿Eliminar ${ids.length === 1 ? "este campo" : `${ids.length} campos`}? También se borrarán los valores guardados en los contactos.`)) return;
    const { error } = await createClient().from("custom_field_defs").delete().in("id", ids);
    if (error) return setErr("No se pudo eliminar el campo.");
    setSel([]); load();
  };

  return (
    <Page title="Campos Customizados" subtitle="Crea campos personalizados para ampliar la información de tus contactos."
      actions={<button onClick={() => setModal("new")} disabled={!me} className={btnPrimary}><span className="text-lg leading-none">+</span> Crear campo</button>}>
      <Toolbar left={<SearchBox value={q} onChange={setQ} />} onClear={() => { setQ(""); setTypes([]); }}
        filter={
          <FilterButton active={types.length > 0}>
            <p className="mb-3 text-sm font-semibold">Tipo</p>
            {TYPES.map((t) => (
              <label key={t.value} className="flex items-center gap-2 py-1 text-sm">
                <Check label={t.label} checked={types.includes(t.value)} onChange={(v) => setTypes(v ? [...types, t.value] : types.filter((x) => x !== t.value))} /> {t.label}
              </label>
            ))}
          </FilterButton>
        } />
      <Alert text={err} />
      <div className="mt-6 flex items-center justify-between">
        <p className="text-base font-semibold text-slate-900">Total de campos {rows?.length ?? 0}</p>
        {sel.length > 0 && <button onClick={() => del(sel)} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Icon name="trash" size={18} /> Eliminar ({sel.length})</button>}
      </div>
      <div className="scroll-x">
        <table className={TABLE}>
          <thead><tr>
            <th className="w-10 px-3 py-4"><Check label="Seleccionar todos" checked={allOn} onChange={(v) => setSel(v ? sorted.map((d) => d.id) : [])} /></th>
            <Th onSort={() => toggle("name")}>Nombre</Th><Th>Tipo</Th><th className="w-12" />
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={4} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
            {rows !== null && sorted.length === 0 && <tr><td colSpan={4} className="py-16 text-center text-slate-500">{rows.length === 0 ? "Aún no tienes campos. Usa “Crear campo” para añadir el primero." : "Ningún campo coincide con los filtros."}</td></tr>}
            {sorted.map((d) => (
              <tr key={d.id} className={`group ${ROW}`}>
                <td className="px-3 py-3"><Check label={`Seleccionar ${d.name}`} checked={sel.includes(d.id)} onChange={(v) => setSel(v ? [...sel, d.id] : sel.filter((x) => x !== d.id))} /></td>
                <td className="px-3 py-3 text-slate-700">
                  {d.name}
                  <button onClick={() => setModal(d)} aria-label={`Editar ${d.name}`} className="ml-2 inline-block align-middle text-slate-400 opacity-0 hover:text-indigo-600 focus:opacity-100 group-hover:opacity-100"><Icon name="pencil" size={16} /></button>
                </td>
                <td className="px-3 py-3 text-slate-500">{typeLabel(d.type)}</td>
                <td className="px-3 py-3 text-right"><button onClick={() => del([d.id])} aria-label={`Eliminar ${d.name}`} className="text-slate-400 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"><Icon name="trash" size={18} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && me && <FieldModal def={modal === "new" ? null : modal} orgId={me.orgId} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </Page>
  );
}
