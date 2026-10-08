"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Check, FilterButton, fmtDate, Page, ROW, SearchBox, TABLE, Th, Toolbar, useSort } from "@/components/settings/kit";

type Tag = { id: string; name: string; color: string };
type Row = { id: string; name: string; phone_number: string; country_code: string; created_at: string; tags: Tag[] };

const FETCH = 1000;
const PAGE = 50;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "#";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ContactsClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [plan, setPlan] = useState<{ max: number | null; hits: number } | null>(null);

  useEffect(() => {
    createClient().rpc("connections_overview").then(({ data }) => {
      if (data) setPlan({ max: (data.max_contacts as number | null) ?? null, hits: (data.contact_limit_hits as number) ?? 0 });
    });
  }, []);

  useEffect(() => {
    createClient()
      .from("contacts")
      .select("id, name, phone_number, country_code, created_at, contact_tags(tag:tags(id, name, color))", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(FETCH)
      .then(({ data, count, error }) => {
        if (error) { setErr("No se pudieron cargar los contactos."); setRows([]); return; }
        setTotal(count ?? data?.length ?? 0);
        setRows((data ?? []).map((c) => ({
          id: c.id as string, name: (c.name as string | null) ?? "", phone_number: c.phone_number as string,
          country_code: (c.country_code as string | null) ?? "", created_at: c.created_at as string,
          tags: ((c.contact_tags as unknown as { tag: Tag | null }[]) ?? []).flatMap((t) => (t.tag ? [t.tag] : [])),
        })));
      });
  }, []);

  const allTags = useMemo(() => {
    const m = new Map<string, Tag>();
    (rows ?? []).forEach((r) => r.tags.forEach((t) => m.set(t.id, t)));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [rows]);

  const needle = norm(q.trim());
  const shown = (rows ?? []).filter((r) =>
    (!needle || norm(`${r.name} ${r.phone_number}`).includes(needle)) &&
    (tagIds.length === 0 || r.tags.some((t) => tagIds.includes(t.id))));
  const { sorted, toggle } = useSort(shown, { key: "created_at", dir: -1 });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const pageRows = sorted.slice(cur * PAGE, cur * PAGE + PAGE);
  const allOn = pageRows.length > 0 && pageRows.every((r) => sel.includes(r.id));
  const filtered = !!needle || tagIds.length > 0;

  return (
    <Page title="Contactos" subtitle="Consulta y busca a las personas que han escrito a tus números de WhatsApp.">
      <Toolbar
        left={<SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} />}
        onClear={() => { setQ(""); setTagIds([]); setPage(0); }}
        filter={
          <FilterButton active={tagIds.length > 0}>
            <p className="mb-3 text-sm font-semibold">Tags</p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {allTags.map((t) => (
                <label key={t.id} className="flex items-center gap-2 py-1 text-sm">
                  <Check label={t.name} checked={tagIds.includes(t.id)} onChange={(v) => { setTagIds(v ? [...tagIds, t.id] : tagIds.filter((x) => x !== t.id)); setPage(0); }} />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} /> <span className="truncate">{t.name}</span>
                </label>
              ))}
              {allTags.length === 0 && <span className="text-sm text-slate-400">Aún no hay tags en tus contactos.</span>}
            </div>
          </FilterButton>
        } />
      <Alert text={err} />
      {plan?.max != null && total >= plan.max && (
        <p role="alert" className="mt-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Alcanzaste el límite de {plan.max.toLocaleString("es-PE")} contactos de tu plan.{plan.hits > 0 ? ` ${plan.hits.toLocaleString("es-PE")} contacto(s) nuevo(s) no se registraron.` : ""} Comunícate con tu proveedor para ampliarlo.
        </p>
      )}
      <p className="mt-6 text-base font-semibold text-slate-900">
        Total de contactos {total.toLocaleString("es-PE")}{plan?.max != null ? ` / ${plan.max.toLocaleString("es-PE")}` : ""}{filtered && rows !== null ? ` · ${sorted.length.toLocaleString("es-PE")} coinciden` : ""}
      </p>
      <div className="scroll-x">
        <table className={TABLE}>
          <thead><tr>
            <th className="w-10 px-3 py-4"><Check label="Seleccionar página" checked={allOn} onChange={(v) => setSel(v ? Array.from(new Set([...sel, ...pageRows.map((r) => r.id)])) : sel.filter((x) => !pageRows.some((r) => r.id === x)))} /></th>
            <Th onSort={() => toggle("name")}>Nombre</Th><Th>Teléfono</Th><Th>País</Th><Th>Tags</Th><Th onSort={() => toggle("created_at")}>Creado</Th>
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
            {rows !== null && pageRows.length === 0 && (
              <tr><td colSpan={6} className="py-16 text-center text-slate-500">
                {rows.length === 0 ? "Aún no hay contactos. Aparecerán cuando alguien escriba a tu canal." : "Ningún contacto coincide con los filtros."}
              </td></tr>
            )}
            {pageRows.map((r) => (
              <tr key={r.id} className={ROW}>
                <td className="px-3 py-3"><Check label={`Seleccionar ${r.name || r.phone_number}`} checked={sel.includes(r.id)} onChange={(v) => setSel(v ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3 font-medium text-slate-700">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700" aria-hidden>{initials(r.name)}</span>
                    {r.name || <span className="font-normal text-slate-400">Sin nombre</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{r.phone_number}</td>
                <td className="px-3 py-3 text-slate-500">{r.country_code || "-----"}</td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap gap-1">
                    {r.tags.length === 0 && <span className="text-slate-400">-----</span>}
                    {r.tags.map((t) => <span key={t.id} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: t.color }}>{t.name}</span>)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows !== null && sorted.length > PAGE && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-600">
          <span>Página {cur + 1} de {pages}</span>
          <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">Anterior</button>
          <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className="rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">Siguiente</button>
        </div>
      )}
      {rows !== null && total > FETCH && <p className="mt-3 text-xs text-slate-500">Mostrando los {FETCH.toLocaleString("es-PE")} contactos más recientes de {total.toLocaleString("es-PE")}.</p>}
    </Page>
  );
}
