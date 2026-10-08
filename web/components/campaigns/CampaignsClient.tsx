"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type GroupLite = { id: string; name: string; type: "group" | "community" | "channel"; participants: number; admins: number; capacity: number | null; avatar_url: string | null; connected: boolean };
export type Campaign = { id: string; name: string; slug: string; type: "group" | "community"; clicks: number; groups: GroupLite[] };

type ColKey = "link" | "groups" | "admins" | "joins" | "type";
const COLS: { key: ColKey; label: string }[] = [
  { key: "link", label: "Link" }, { key: "groups", label: "Grupos" }, { key: "admins", label: "Administradores" },
  { key: "joins", label: "Ingresos/Clicks" }, { key: "type", label: "Tipo" },
];
const TYPES = { group: "Grupo", community: "Comunidad" } as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Admins({ n }: { n: number }) {
  if (n <= 0) return <span className="text-slate-500">—</span>;
  return (
    <span className="flex items-center" title={`${n} admins`}>
      {Array.from({ length: Math.min(n, 4) }, (_, i) => (
        <span key={i} className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-green-100 text-sm text-green-600" aria-hidden>✆</span>
      ))}
      {n > 4 && <span className="ml-3 flex h-8 min-w-8 items-center justify-center rounded-full border bg-white px-1 text-xs">+{n - 4}</span>}
    </span>
  );
}

const Avatar = ({ g }: { g?: GroupLite }) => (
  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-slate-100 text-slate-400">
    {g?.avatar_url
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={g.avatar_url} alt="" className="h-full w-full object-cover" />
      : "👥"}
  </span>
);

export function CampaignsClient({ campaigns, available, isAdmin }: { campaigns: Campaign[]; available: GroupLite[]; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [cols, setCols] = useState<Record<ColKey, boolean>>({ link: true, groups: true, admins: true, joins: true, type: true });
  const [menu, setMenu] = useState<null | "cols" | "filter">(null);
  const [form, setForm] = useState<null | { id: string | null; name: string; type: "group" | "community"; ids: string[] }>(null);
  const [view, setView] = useState<Campaign | null>(null);
  const [gq, setGq] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = campaigns.filter((c) => (!type || c.type === type) && (!q.trim() || norm(c.name).includes(norm(q.trim()))));
  const link = (c: Campaign) => `${typeof window === "undefined" ? "" : window.location.origin}/g/${c.slug}`;
  const visible = COLS.filter((c) => cols[c.key]);
  const th = "whitespace-nowrap px-5 py-4 text-sm font-semibold uppercase tracking-wide text-slate-700";
  const input = "w-full rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-900";

  const choices = form ? available.filter((g) => g.type === form.type && norm(g.name).includes(norm(gq.trim()))) : [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setErr(null);
    const { error } = form.id
      ? await supabase.rpc("update_group_campaign", { p_id: form.id, p_name: form.name, p_group_ids: form.ids })
      : await supabase.rpc("create_group_campaign", { p_name: form.name, p_type: form.type, p_group_ids: form.ids });
    setBusy(false);
    if (error) return setErr(error.message);
    setForm(null);
    router.refresh();
  }

  async function remove(c: Campaign) {
    if (!confirm(`¿Eliminar la campaña "${c.name}"? Su enlace dejará de funcionar.`)) return;
    const { error } = await supabase.rpc("delete_group_campaign", { p_id: c.id });
    if (error) return setErr(error.message);
    router.refresh();
  }

  const cell = (c: Campaign, k: ColKey): React.ReactNode => {
    const joins = c.groups.reduce((n, g) => n + g.participants, 0);
    switch (k) {
      case "link":
        return (
          <span className="flex items-center gap-3">
            <span className="max-w-[170px] truncate">{link(c)}</span>
            <button aria-label="Copiar enlace" title="Copiar enlace" onClick={() => navigator.clipboard?.writeText(link(c))} className="text-slate-600 hover:text-slate-900">⧉</button>
          </span>
        );
      case "groups": return c.groups.length;
      case "admins":
        return c.groups.length > 0 && c.groups.every((g) => !g.connected)
          ? <span className="inline-flex items-center rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600">⚠ Sin conexión</span>
          : <Admins n={Math.max(0, ...c.groups.map((g) => g.admins))} />;
      case "joins": return `${joins}/${c.clicks} (${c.clicks ? Math.round((joins / c.clicks) * 100) : 0}%)`;
      case "type":
        return c.type === "community"
          ? <span className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-base font-medium text-white">👥 <span className="ml-2">Comunidad</span></span>
          : <span className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-base font-medium">👥 <span className="ml-2">Grupo</span></span>;
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Campañas</h1>
          <p className="text-base text-slate-600">Crea campañas para llenar grupos y comunidades de manera masiva y automática.</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setErr(null); setGq(""); setForm({ id: null, name: "", type: "group", ids: [] }); }}
            className="shrink-0 rounded-full bg-slate-900 px-6 py-3 text-base font-medium text-white hover:bg-slate-700">+ Crear campaña</button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre..." value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-md rounded-full border border-slate-300 bg-white px-5 py-3 text-base text-slate-900" />
        <div className="relative flex gap-3" ref={box}>
          <button onClick={() => setMenu(menu === "cols" ? null : "cols")} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-base shadow-sm">▥ Columnas</button>
          <button onClick={() => setMenu(menu === "filter" ? null : "filter")} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-base shadow-sm">⏷ Filtrar</button>
          {menu === "cols" && (
            <ul className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white py-2 shadow-lg">
              {COLS.map((c) => (
                <li key={c.key}>
                  <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={cols[c.key]} onChange={() => setCols({ ...cols, [c.key]: !cols[c.key] })} /> {c.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {menu === "filter" && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border bg-white p-4 shadow-lg">
              <label className="block text-xs text-slate-600">Tipo
                <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                  <option value="">Todos</option><option value="group">Grupo</option><option value="community">Comunidad</option>
                </select>
              </label>
              {type && <button onClick={() => setType("")} className="mt-3 text-sm text-indigo-600 hover:underline">Limpiar filtro</button>}
            </div>
          )}
        </div>
      </div>

      {err && !form && <p className="mb-3 text-sm text-red-600" role="alert">{err}</p>}

      <div className="scroll-x max-h-[calc(100vh-17rem)] rounded-2xl border border-slate-300 bg-white">
        <table className="w-full min-w-[1100px] text-left text-base text-slate-900">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <th className={th}>Nombre</th>
              {visible.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
              <th className="w-40 px-5 py-4" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={visible.length + 2} className="px-5 py-16 text-center text-base text-slate-600">
                {campaigns.length === 0 ? "Aún no hay campañas." : "Ninguna campaña coincide con los filtros."}
              </td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-5 py-4">
                  <span className="flex items-center gap-3">
                    <Avatar g={c.groups[0]} />
                    <span className="max-w-[320px] truncate font-semibold" title={c.name}>{c.name}</span>
                  </span>
                </td>
                {visible.map((k) => <td key={k.key} className="whitespace-nowrap px-5 py-4 text-slate-800">{cell(c, k.key)}</td>)}
                <td className="whitespace-nowrap px-5 py-4 text-right text-slate-600">
                  <button aria-label={`Ver ${c.name}`} title="Ver" className="mr-4 hover:text-slate-900" onClick={() => setView(c)}>👁</button>
                  {isAdmin && (
                    <>
                      <button aria-label={`Editar ${c.name}`} title="Editar" className="mr-4 hover:text-slate-900"
                        onClick={() => { setErr(null); setGq(""); setForm({ id: c.id, name: c.name, type: c.type, ids: c.groups.map((g) => g.id) }); }}>✎</button>
                      <button aria-label={`Eliminar ${c.name}`} title="Eliminar" className="hover:text-red-600" onClick={() => remove(c)}>🗑</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onMouseDown={() => setView(null)}>
          <div role="dialog" aria-modal="true" aria-label={view.name} onMouseDown={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div><h2 className="text-xl font-semibold">{view.name}</h2><p className="text-sm text-slate-600">{TYPES[view.type]} · {view.clicks} clicks</p></div>
              <button onClick={() => setView(null)} aria-label="Cerrar">✕</button>
            </div>
            <p className="mb-4 break-all rounded-lg bg-slate-100 px-4 py-3 text-sm">{link(view)}</p>
            <h3 className="mb-2 text-sm font-semibold">Se llenan en este orden</h3>
            <ol className="space-y-2">
              {view.groups.map((g, i) => (
                <li key={g.id} className="flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm">
                  <span className="text-slate-500">{i + 1}.</span><span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="text-slate-600">{g.participants}{g.capacity ? `/${g.capacity}` : ""} part.</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onMouseDown={() => setForm(null)}>
          <form onSubmit={save} role="dialog" aria-modal="true" aria-label={form.id ? "Editar campaña" : "Crear campaña"} onMouseDown={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">{form.id ? "Editar campaña" : "Crear campaña"}</h2>
                <p className="text-sm text-slate-600">Un solo enlace que lleva a las personas al primer grupo con cupo.</p>
              </div>
              <button type="button" onClick={() => setForm(null)} aria-label="Cerrar">✕</button>
            </div>
            <input required aria-label="Nombre de la campaña" placeholder="Nombre de la campaña" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            {!form.id && (
              <div className="flex gap-3" role="radiogroup" aria-label="Tipo">
                {(["group", "community"] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={form.type === t} onClick={() => setForm({ ...form, type: t, ids: [] })}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm ${form.type === t ? "border-slate-900 bg-slate-100 font-medium" : "hover:bg-slate-50"}`}>
                    {t === "group" ? "Grupos" : "Comunidades"}
                  </button>
                ))}
              </div>
            )}
            <input type="search" aria-label="Buscar" placeholder="Buscar para agregar…" value={gq} onChange={(e) => setGq(e.target.value)} className={input} />
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
              {choices.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">
                {available.some((g) => g.type === form.type) ? "Sin resultados." : "Primero importa grupos o comunidades en la sección Grupos y comunidades."}
              </li>}
              {choices.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={form.ids.includes(g.id)}
                      onChange={() => setForm({ ...form, ids: form.ids.includes(g.id) ? form.ids.filter((x) => x !== g.id) : [...form.ids, g.id] })} />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <span className="text-xs text-slate-500">{g.participants} part.</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-600">{form.ids.length} seleccionados · el orden en que los marcas es el orden en que se llenan.</p>
            {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setForm(null)} className="rounded-full border px-5 py-2.5 text-sm">Cancelar</button>
              <button disabled={busy || form.ids.length === 0 || !form.name.trim()} className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Guardando…" : form.id ? "Guardar" : "Crear campaña"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
