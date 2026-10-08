"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnPrimary, Check, Field, FilterButton, fmtDate, inputCls, Modal, ModalActions, Page, ROW, SearchBox, TABLE, Th, Toolbar, useMe, useSort } from "./kit";

export const TAG_COLORS = ["#ef4d5f", "#b92d24", "#f2a7a7", "#ee7d2b", "#f7d559", "#ebb740", "#b5e049", "#5cc15c", "#9ef0b8", "#67d6c3",
  "#2e6a85", "#a7cdf9", "#4fa8ec", "#2f6fe8", "#5144e0", "#8c5ae8", "#e07ae8", "#ecd5f5", "#9aa5b8", "#1f2937"];

type Tag = { id: string; name: string; description: string | null; color: string; created_at: string; contacts: number };

function TagModal({ tag, orgId, onClose, onSaved }: { tag: Tag | null; orgId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tag?.name ?? "");
  const [desc, setDesc] = useState(tag?.description ?? "");
  const [color, setColor] = useState(tag?.color && TAG_COLORS.includes(tag.color) ? tag.color : tag?.color ?? TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    const row = { name: name.trim(), description: desc.trim() || null, color };
    const sb = createClient();
    const { error } = tag ? await sb.from("tags").update(row).eq("id", tag.id) : await sb.from("tags").insert({ ...row, organization_id: orgId });
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "Ya existe un tag con ese nombre." : "No se pudo guardar el tag.");
    onSaved();
  };

  return (
    <Modal title={tag ? "Editar tag" : "Crear tag"} description="Asigna el nombre de la etiqueta con la que agruparás tus contactos, en base a acciones o segmentos." onClose={onClose}>
      <Field label="Nombre del tag" required counter={`${name.length}/100`}>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Escribe el nombre" className={inputCls} autoFocus />
      </Field>
      <Field label="Descripción (opcional)" counter={`${desc.length}/500`}>
        <textarea value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} placeholder="Escribe una descripción" rows={4} className={inputCls} />
      </Field>
      <Field label="Color del tag">
        <div className="grid grid-cols-10 gap-2">
          {TAG_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${color === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`} style={{ background: c }}>
              {color === c && "✓"}
            </button>
          ))}
        </div>
      </Field>
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={save} okLabel="Ejecutar acción" disabled={!name.trim()} busy={busy} />
    </Modal>
  );
}

export function TagsClient() {
  const me = useMe();
  const [rows, setRows] = useState<Tag[] | null>(null);
  const [q, setQ] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [modal, setModal] = useState<Tag | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("tags").select("id,name,description,color,created_at,contact_tags(count)").order("created_at", { ascending: false });
    if (error) { setErr("No se pudieron cargar los tags."); setRows([]); return; }
    setRows((data ?? []).map((t) => ({ ...(t as unknown as Tag), contacts: (t.contact_tags as unknown as { count: number }[])?.[0]?.count ?? 0 })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows ?? []).filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()) && (colors.length === 0 || colors.includes(t.color)));
  const { sorted, toggle } = useSort(shown, { key: "created_at", dir: -1 });
  const allOn = sorted.length > 0 && sorted.every((t) => sel.includes(t.id));

  const remove = async () => {
    if (!confirm(`¿Eliminar ${sel.length} tag(s)? Se quitarán también de los contactos que los tengan.`)) return;
    const { error } = await createClient().from("tags").delete().in("id", sel);
    if (error) return setErr("No se pudieron eliminar los tags.");
    setSel([]); load();
  };
  const usedColors = Array.from(new Set((rows ?? []).map((t) => t.color)));

  return (
    <Page title="Tags" subtitle="Crea etiquetas para agrupar a tus contactos, en base a acciones o segmentos."
      actions={<button onClick={() => setModal("new")} disabled={!me} className={btnPrimary}><span className="text-lg leading-none">+</span> Crear Tag</button>}>
      <Toolbar
        left={<SearchBox value={q} onChange={setQ} />}
        onClear={() => { setQ(""); setColors([]); }}
        filter={
          <FilterButton active={colors.length > 0}>
            <p className="mb-3 text-sm font-semibold">Color</p>
            <div className="flex flex-wrap gap-2">
              {usedColors.map((c) => (
                <button key={c} onClick={() => setColors(colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c])} aria-pressed={colors.includes(c)}
                  className={`h-8 w-8 rounded-full ${colors.includes(c) ? "ring-2 ring-offset-2 ring-indigo-500" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} />
              ))}
              {usedColors.length === 0 && <span className="text-sm text-slate-400">Aún no hay tags.</span>}
            </div>
          </FilterButton>
        } />
      <Alert text={err} />
      <div className="mt-6 flex items-center justify-between">
        <p className="text-base font-semibold text-slate-900">Total de Tags {rows?.length ?? 0}</p>
        {sel.length > 0 && <button onClick={remove} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Icon name="trash" size={18} /> Eliminar ({sel.length})</button>}
      </div>
      <div className="scroll-x">
        <table className={TABLE}>
          <thead><tr>
            <th className="w-10 px-3 py-4"><Check label="Seleccionar todos" checked={allOn} onChange={(v) => setSel(v ? sorted.map((t) => t.id) : [])} /></th>
            <Th onSort={() => toggle("name")}>Nombre</Th><Th>Descripción</Th><Th>Contactos</Th><Th>Color</Th><Th onSort={() => toggle("created_at")}>Creado</Th>
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
            {rows !== null && sorted.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-500">{rows.length === 0 ? "Aún no tienes tags. Usa “Crear Tag” para añadir el primero." : "Ningún tag coincide con los filtros."}</td></tr>}
            {sorted.map((t) => (
              <tr key={t.id} className={ROW}>
                <td className="px-3 py-3"><Check label={`Seleccionar ${t.name}`} checked={sel.includes(t.id)} onChange={(v) => setSel(v ? [...sel, t.id] : sel.filter((x) => x !== t.id))} /></td>
                <td className="max-w-xs px-3 py-3"><button onClick={() => setModal(t)} className="truncate text-left font-medium text-slate-700 hover:text-indigo-600" title={t.name}>{t.name}</button></td>
                <td className="max-w-xs truncate px-3 py-3 text-slate-500">{t.description || "-----"}</td>
                <td className="px-3 py-3 text-slate-700">{t.contacts}</td>
                <td className="px-3 py-3"><span className="inline-block h-5 w-5 rounded-full" style={{ background: t.color }} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{fmtDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && me && <TagModal tag={modal === "new" ? null : modal} orgId={me.orgId} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </Page>
  );
}
