"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ImportDialog, type Device } from "./ImportDialog";

export type WaGroup = {
  id: string; name: string; origin: string; type: "group" | "community" | "channel";
  clicks: number; admins: number; participants: number; scheduled_messages: number;
  capacity: number | null; auto_capacity: boolean; invite_link: string | null; avatar_url: string | null; created_at: string; updated_at: string; last_synced_at: string | null;
};

type ColKey = "origin" | "clicks" | "admins" | "participants" | "scheduled_messages" | "type" | "capacity" | "created_at" | "updated_at" | "last_synced_at";
const COLS: { key: ColKey; label: string }[] = [
  { key: "origin", label: "Origen" }, { key: "clicks", label: "Clicks" }, { key: "admins", label: "Admins" },
  { key: "participants", label: "Participantes" }, { key: "scheduled_messages", label: "Msg. programados" },
  { key: "type", label: "Tipo" }, { key: "capacity", label: "Capacidad" }, { key: "created_at", label: "Creado" },
  { key: "updated_at", label: "Actualización" }, { key: "last_synced_at", label: "Última sincronización" },
];
const TYPES = { group: "Grupo", community: "Comunidad", channel: "Canal" } as const;
const ORIGINS: Record<string, string> = { import: "Importado", created: "Creado" };
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "")}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};
const Icon = ({ children }: { children: string }) => <span className="mr-1.5 text-slate-400" aria-hidden>{children}</span>;

// círculos verdes de los administradores (máximo 3) y "+N" con el resto
function Admins({ n }: { n: number }) {
  if (n <= 0) return <span className="text-slate-400">0</span>;
  return (
    <span className="flex items-center" title={`${n} admins`}>
      {Array.from({ length: Math.min(n, 3) }, (_, i) => (
        <span key={i} className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-green-100 text-xs text-green-600" aria-hidden>✆</span>
      ))}
      {n > 3 && <span className="ml-3 flex h-7 min-w-7 items-center justify-center rounded-full border bg-white px-1 text-[11px]">+{n - 3}</span>}
    </span>
  );
}

export function GroupsTable({ groups, devices, isAdmin }: { groups: WaGroup[]; devices: Device[]; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "created_at"; dir: 1 | -1 }>({ key: "created_at", dir: -1 });
  const [cols, setCols] = useState<Record<ColKey, boolean>>(Object.fromEntries(COLS.map((c) => [c.key, true])) as Record<ColKey, boolean>);
  const [menu, setMenu] = useState<null | "cols" | "filter">(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const [rowMenu, setRowMenu] = useState<string | null>(null);

  async function remove(ids: string[]) {
    if (!confirm(ids.length === 1 ? "¿Eliminar este registro de la lista?" : `¿Eliminar ${ids.length} registros de la lista?`)) return;
    setErr(null);
    const { error } = await createClient().rpc("delete_wa_groups", { p_ids: ids });
    if (error) return setErr(error.message);
    setPicked(new Set());
    setRowMenu(null);
    router.refresh();
  }

  async function toggleCapacity(id: string, on: boolean) {
    setErr(null);
    const { error } = await createClient().rpc("set_group_capacity", { p_id: id, p_on: on });
    if (error) return setErr(error.message);
    router.refresh();
  }
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(null);
      if (!(e.target as HTMLElement).closest("[data-rowmenu]")) setRowMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups
      .filter((g) => (!type || g.type === type) && (!s || g.name.toLowerCase().includes(s)))
      .sort((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name) : +new Date(a.created_at) - +new Date(b.created_at)) * sort.dir);
  }, [groups, q, type, sort]);

  const toggleSort = (key: "name" | "created_at") => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const th = "whitespace-nowrap px-4 py-4 text-xs font-medium uppercase tracking-wide text-slate-500";
  const visible = COLS.filter((c) => cols[c.key]);
  const cell = (g: WaGroup, k: ColKey): React.ReactNode => {
    switch (k) {
      case "origin":
        return g.origin === "created"
          ? <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium">✦ <span className="ml-1">Funnelchat</span></span>
          : <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 text-sm font-medium text-green-700">⇪ <span className="ml-1">WhatsApp</span></span>;
      case "clicks": return <span className="font-medium"><Icon>↖</Icon>{g.clicks}</span>;
      case "admins": return <Admins n={g.admins} />;
      case "participants": return <span className="font-medium"><Icon>👥</Icon>{g.participants}</span>;
      case "scheduled_messages": return <span className="font-medium"><Icon>💬</Icon>{g.scheduled_messages}</span>;
      case "type":
        return g.type === "community"
          ? <span className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">👥 <span className="ml-2">Comunidad</span></span>
          : <span className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-medium">👥 <span className="ml-2">{TYPES[g.type]}</span></span>;
      case "capacity":
        return (
          <button type="button" role="switch" aria-checked={g.auto_capacity} aria-label={`Capacidad de ${g.name}`} disabled={!isAdmin}
            onClick={() => toggleCapacity(g.id, !g.auto_capacity)}
            className={`relative h-6 w-11 rounded-full transition ${g.auto_capacity ? "bg-slate-900" : "bg-slate-200"} disabled:opacity-50`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${g.auto_capacity ? "left-[22px]" : "left-0.5"}`} />
          </button>
        );
      case "created_at": return day(g.created_at);
      case "updated_at": return day(g.updated_at);
      case "last_synced_at": return g.last_synced_at ? day(g.last_synced_at) : "—";
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Grupos, Comunidades y Canales</h1>
          <p className="text-sm text-slate-500">{groups.length} registros en total</p>
        </div>
        {isAdmin && (
          <button onClick={() => setImportOpen(true)} className="shrink-0 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700">⇪ Importar</button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input type="search" aria-label="Buscar por nombre" placeholder="Buscar por nombre..." value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-sm rounded-full border bg-white px-5 py-3 text-sm" />
        <div className="relative flex gap-3" ref={box}>
          <button onClick={() => setMenu(menu === "cols" ? null : "cols")} className="rounded-full border bg-white px-5 py-3 text-sm shadow-sm">▥ Columnas</button>
          <button onClick={() => setMenu(menu === "filter" ? null : "filter")} className="rounded-full border bg-white px-5 py-3 text-sm shadow-sm">⏷ Filtrar</button>
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
                  <option value="">Todos</option>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {type && <button onClick={() => setType("")} className="mt-3 text-sm text-indigo-600 hover:underline">Limpiar filtro</button>}
            </div>
          )}
        </div>
      </div>

      {err && <p className="mb-3 text-sm text-red-600" role="alert">{err}</p>}
      {isAdmin && picked.size > 0 && (
        <div className="mb-3 flex items-center gap-4 text-sm">
          <span>{picked.size} seleccionados</span>
          <button onClick={() => remove([...picked])} className="rounded-full border px-4 py-1.5 text-red-600 hover:bg-red-50">Eliminar</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[1300px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-12 px-4 py-4">
                <input type="checkbox" aria-label="Seleccionar todos" checked={allOn}
                  onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th className={th}><button onClick={() => toggleSort("name")} className="uppercase">Nombre ⇅</button></th>
              {visible.map((c) => (
                <th key={c.key} className={th}>
                  {c.key === "created_at"
                    ? <button onClick={() => toggleSort("created_at")} className="uppercase">{c.label} {sort.key === "created_at" ? (sort.dir === -1 ? "↓" : "↑") : ""}</button>
                    : c.label}
                </th>
              ))}
              <th className="w-12 px-4 py-4" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={visible.length + 3} className="px-4 py-16 text-center text-slate-500">
                {groups.length === 0 ? "Aún no hay grupos, comunidades ni canales." : "Ningún registro coincide con los filtros."}
              </td></tr>
            )}
            {rows.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="px-4 py-4">
                  <input type="checkbox" aria-label={`Seleccionar ${g.name}`} checked={picked.has(g.id)}
                    onChange={() => setPicked((p) => { const n = new Set(p); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-slate-100 text-slate-400">
                      {g.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={g.avatar_url} alt="" className="h-full w-full object-cover" />
                        : "👥"}
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[240px] truncate font-semibold" title={g.name}>{g.name}</span>
                      {g.invite_link && <a href={g.invite_link} target="_blank" rel="noreferrer" className="block max-w-[240px] truncate text-xs text-slate-500 hover:underline">{g.invite_link}</a>}
                    </span>
                  </div>
                </td>
                {visible.map((c) => <td key={c.key} className="whitespace-nowrap px-4 py-3 text-slate-600">{cell(g, c.key)}</td>)}
                <td className="relative px-4 py-3 text-right" data-rowmenu>
                  <button aria-label={`Acciones de ${g.name}`} aria-haspopup="menu" aria-expanded={rowMenu === g.id}
                    onClick={() => setRowMenu(rowMenu === g.id ? null : g.id)} className="px-2 text-lg leading-none text-slate-500 hover:text-slate-900">···</button>
                  {rowMenu === g.id && (
                    <ul role="menu" className="absolute right-4 top-full z-20 w-44 rounded-xl border bg-white py-1 text-left text-sm shadow-lg">
                      {g.invite_link && (
                        <li><button role="menuitem" className="w-full px-4 py-2 text-left hover:bg-slate-50"
                          onClick={() => { navigator.clipboard?.writeText(g.invite_link!); setRowMenu(null); }}>Copiar enlace</button></li>
                      )}
                      {isAdmin && <li><button role="menuitem" className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => remove([g.id])}>Eliminar</button></li>}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importOpen && <ImportDialog devices={devices} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
