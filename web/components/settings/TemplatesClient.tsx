"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnPrimary, Check, FilterButton, fmtDate, Notice, Page, ROW, SearchBox, TABLE, Th, Toolbar, useSort } from "./kit";

export const CATEGORIES = [{ v: "marketing", l: "Marketing" }, { v: "utility", l: "Utilidad" }, { v: "authentication", l: "Autenticación" }];
const STATUS: Record<string, string> = { draft: "Borrador", pending: "En revisión", approved: "Aprobada", rejected: "Rechazada" };

type Tpl = { id: string; name: string; category: string; status: string; created_at: string; device: string };

export function TemplatesClient() {
  const [rows, setRows] = useState<Tpl[] | null>(null);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("message_templates").select("id,name,category,status,created_at,channels(name)").order("created_at", { ascending: false });
    if (error) { setErr("No se pudieron cargar las plantillas."); setRows([]); return; }
    setRows((data ?? []).map((t) => ({ ...(t as unknown as Tpl), device: (t.channels as unknown as { name: string } | null)?.name ?? "-" })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows ?? []).filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()) && (cats.length === 0 || cats.includes(t.category)));
  const { sorted, toggle } = useSort(shown, { key: "created_at", dir: -1 });
  const allOn = sorted.length > 0 && sorted.every((t) => sel.includes(t.id));

  const remove = async () => {
    if (!confirm(`¿Eliminar ${sel.length} plantilla(s)?`)) return;
    const { error } = await createClient().from("message_templates").delete().in("id", sel);
    if (error) return setErr("No se pudieron eliminar las plantillas.");
    setSel([]); load();
  };

  return (
    <Page title="Plantillas de mensaje" subtitle="Gestiona las plantillas para tus mensajes"
      actions={<>
        <button onClick={() => setNote("La sincronización con Meta estará disponible cuando se conecte la API oficial de WhatsApp. Por ahora las plantillas se guardan como borrador.")} className={btnPrimary}>
          <span aria-hidden>⟳</span> Sincronizar
        </button>
        <Link href="/settings/templates/new" className={btnPrimary}><span className="text-lg leading-none">+</span> Crear Plantilla</Link>
      </>}>
      <Toolbar left={<SearchBox value={q} onChange={setQ} />} onClear={() => { setQ(""); setCats([]); }}
        filter={
          <FilterButton active={cats.length > 0}>
            <p className="mb-3 text-sm font-semibold">Categoría</p>
            {CATEGORIES.map((c) => (
              <label key={c.v} className="flex items-center gap-2 py-1 text-sm">
                <Check label={c.l} checked={cats.includes(c.v)} onChange={(v) => setCats(v ? [...cats, c.v] : cats.filter((x) => x !== c.v))} /> {c.l}
              </label>
            ))}
          </FilterButton>
        } />
      <Notice text={note} /><Alert text={err} />
      <div className="mt-6 flex items-center justify-between">
        <p className="text-base font-semibold text-slate-900">Total de plantillas {rows?.length ?? 0}</p>
        {sel.length > 0 && <button onClick={remove} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Icon name="trash" size={18} /> Eliminar ({sel.length})</button>}
      </div>
      <div className="scroll-x">
        <table className={TABLE}>
          <thead><tr>
            <th className="w-10 px-3 py-4"><Check label="Seleccionar todas" checked={allOn} onChange={(v) => setSel(v ? sorted.map((t) => t.id) : [])} /></th>
            <Th onSort={() => toggle("name")}>Nombre</Th><Th>Categoría</Th><Th>Dispositivo</Th><Th>Estado</Th><Th onSort={() => toggle("created_at")}>Creado</Th>
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
            {rows !== null && sorted.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-500">{rows.length === 0 ? "Aún no tienes plantillas. Usa “Crear Plantilla” para añadir la primera." : "Ninguna plantilla coincide con los filtros."}</td></tr>}
            {sorted.map((t) => (
              <tr key={t.id} className={ROW}>
                <td className="px-3 py-3"><Check label={`Seleccionar ${t.name}`} checked={sel.includes(t.id)} onChange={(v) => setSel(v ? [...sel, t.id] : sel.filter((x) => x !== t.id))} /></td>
                <td className="max-w-xs truncate px-3 py-3 font-medium text-slate-700" title={t.name}>{t.name}</td>
                <td className="px-3 py-3 text-slate-500">{CATEGORIES.find((c) => c.v === t.category)?.l}</td>
                <td className="px-3 py-3 text-slate-500">{t.device}</td>
                <td className="px-3 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{STATUS[t.status]}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{fmtDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
