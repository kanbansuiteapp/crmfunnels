"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TRIGGERS, type AutomationRow, type Folder } from "./types";

type Sort = { key: "name" | "created_at"; dir: 1 | -1 };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "Hoy a las 2:00 PM", "Ayer a las…", "El lunes a las…" (últimos 7 días) o fecha completa
function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `Hoy a las ${time}`;
  if (days === 1) return `Ayer a las ${time}`;
  if (days > 1 && days < 7) return `El ${d.toLocaleDateString("es", { weekday: "long" })} a las ${time}`;
  return `${d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "")}, ${time}`;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function AutomationsList({ items, folders, isAdmin }: { items: AutomationRow[]; folders: Folder[]; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: -1 });
  const [folderModal, setFolderModal] = useState<{ id: string | null; name: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const menuBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => menuBox.current && !menuBox.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = useMemo(() => {
    const s = norm(q.trim());
    const out = items.filter((a) => {
      if (folder && a.folder_id !== folder) return false;
      if (!s) return true;
      // busca por nombre, palabra clave/valor del disparador o tipo de disparador
      return norm(`${a.name} ${TRIGGERS[a.trigger_type].label} ${Object.values(a.conditions).join(" ")}`).includes(s);
    });
    return [...out].sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name) * sort.dir : (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * sort.dir);
  }, [items, q, folder, sort]);

  const toggleSort = (key: Sort["key"]) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  async function saveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!folderModal) return;
    setErr(null);
    const { error } = folderModal.id
      ? await supabase.rpc("rename_automation_folder", { p_id: folderModal.id, p_name: folderModal.name })
      : await supabase.rpc("create_automation_folder", { p_name: folderModal.name });
    if (error) return setErr(error.message);
    setFolderModal(null);
    router.refresh();
  }

  async function removeFolder(f: Folder) {
    setMenu(null);
    if (!confirm(`¿Eliminar la carpeta "${f.name}"? Sus automatizaciones no se borran, quedarán sin carpeta.`)) return;
    const { error } = await supabase.rpc("delete_automation_folder", { p_id: f.id });
    if (error) return setErr(error.message);
    if (folder === f.id) setFolder(null);
    router.refresh();
  }

  async function toggle(a: AutomationRow) {
    if (!isAdmin) return;
    const { error } = await supabase.rpc("set_automation_enabled", { p_id: a.id, p_enabled: !a.enabled });
    if (error) setErr(error.message);
    else router.refresh();
  }

  const SortBtn = ({ k, label }: { k: Sort["key"]; label: string }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 font-semibold" aria-label={`Ordenar por ${label}`}>
      {label}<span aria-hidden className="text-slate-400">{sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : "⇅"}</span>
    </button>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mis automatizaciones</h1>
          <p className="text-sm text-slate-500">Administra y gestiona todos tus automatizaciones creadas en la aplicación.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-3">
            <button onClick={() => { setErr(null); setFolderModal({ id: null, name: "" }); }}
              className="rounded-lg border border-indigo-400 px-5 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">📁 Crear carpeta</button>
            <Link href="/automations/new" className="rounded-lg bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-600">+ Crear automatización</Link>
          </div>
        )}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, palabra clave o disparador…" aria-label="Buscar automatizaciones"
        className="mb-6 w-full max-w-md rounded-lg border px-4 py-2.5 text-sm" />
      {err && <p className="mb-3 text-sm text-red-600" role="alert">{err}</p>}

      <h2 className="mb-3 text-sm font-semibold text-indigo-600">Carpetas</h2>
      <div className="mb-8 flex flex-wrap gap-3" ref={menuBox}>
        {folders.length === 0 && (
          <p className="text-sm text-slate-500">{isAdmin ? "Aún no tienes carpetas. Crea una para organizar tus automatizaciones." : "Aún no hay carpetas."}</p>
        )}
        {folders.map((f) => (
          <div key={f.id} className={`relative flex w-64 items-center rounded-lg ${folder === f.id ? "bg-indigo-100" : "bg-slate-100"}`}>
            <button onClick={() => setFolder(folder === f.id ? null : f.id)} aria-pressed={folder === f.id}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm font-medium">
              <span aria-hidden>📁</span><span className="truncate">{f.name}</span>
            </button>
            {isAdmin && (
              <button onClick={() => setMenu(menu === f.id ? null : f.id)} aria-label={`Opciones de ${f.name}`} aria-expanded={menu === f.id}
                className="px-3 py-3 text-slate-500">⋮</button>
            )}
            {menu === f.id && (
              <div role="menu" className="absolute right-2 top-11 z-20 w-40 rounded-xl border bg-white p-1 text-sm shadow-lg">
                <button role="menuitem" onClick={() => { setMenu(null); setErr(null); setFolderModal({ id: f.id, name: f.name }); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100">Renombrar</button>
                <button role="menuitem" onClick={() => removeFolder(f)} className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-slate-100">Eliminar</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-indigo-600">
        Flujos{folder && <span className="ml-2 font-normal text-slate-500">en «{folders.find((f) => f.id === folder)?.name}» · <button onClick={() => setFolder(null)} className="underline">ver todos</button></span>}
      </h2>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-5 py-4"><SortBtn k="name" label="Nombre" /></th>
              <th className="px-5 py-4 font-semibold">Ejecuciones</th>
              <th className="px-5 py-4"><SortBtn k="created_at" label="Fecha de creación" /></th>
              <th className="px-5 py-4 font-semibold">Estado</th>
              <th className="px-5 py-4"><span className="sr-only">Detalles</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                {items.length === 0
                  ? (isAdmin ? "Aún no tienes automatizaciones. Pulsa «Crear automatización» para empezar." : "Aún no hay automatizaciones.")
                  : "Ninguna automatización coincide con la búsqueda."}
              </td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="max-w-[360px] px-5 py-4 font-semibold">
                  <Link href={`/automations/${a.id}`} className="block truncate hover:underline" title={a.name}>{a.name}</Link>
                  <span className="text-xs font-normal text-slate-500">{TRIGGERS[a.trigger_type].label}</span>
                </td>
                <td className="px-5 py-4 font-semibold text-indigo-700">{a.runs?.[0]?.count ?? 0}</td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-500">{when(a.created_at)}</td>
                <td className="px-5 py-4">
                  <button onClick={() => toggle(a)} disabled={!isAdmin} aria-pressed={a.enabled}
                    title={isAdmin ? (a.enabled ? "Pausar" : "Activar") : undefined}
                    className={`rounded-md px-4 py-1 text-xs font-medium ${a.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"} ${isAdmin ? "cursor-pointer" : "cursor-default"}`}>
                    {a.enabled ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link href={`/automations/${a.id}`} className="text-sm font-medium text-slate-600 hover:text-indigo-700">▸ Detalles</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {folderModal && (
        <Modal title={folderModal.id ? "Renombrar carpeta" : "Crear carpeta"} onClose={() => setFolderModal(null)}>
          <form onSubmit={saveFolder} className="space-y-3">
            <input required autoFocus maxLength={60} value={folderModal.name} onChange={(e) => setFolderModal({ ...folderModal, name: e.target.value })}
              placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta" className="w-full rounded-lg border px-3 py-2.5 text-sm" />
            {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFolderModal(null)} className="rounded-lg border px-4 py-2 text-sm font-medium">Cancelar</button>
              <button className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white">{folderModal.id ? "Guardar" : "Crear"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
