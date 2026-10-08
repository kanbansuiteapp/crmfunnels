"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Whalink = {
  id: string; name: string; slug: string; message: string; tag_name: string | null;
  clicks: number; leads: number; created_at: string; channel_id: string;
  channel: { name: string; phone_number: string | null } | null;
};
type Channel = { id: string; name: string; phone: string };
type Sort = { key: "name" | "created_at"; dir: 1 | -1 };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "")}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-xl leading-none text-slate-500 hover:text-slate-900">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function WhalinksClient({ links, channels, isAdmin }: { links: Whalink[]; channels: Channel[]; isAdmin: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: -1 });
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewing, setViewing] = useState<Whalink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [host, setHost] = useState(""); // el dominio se conoce solo en el navegador
  const filterBox = useRef<HTMLDivElement>(null);

  useEffect(() => setHost(window.location.host), []);
  useEffect(() => {
    const close = (e: MouseEvent) => filterBox.current && !filterBox.current.contains(e.target as Node) && setFilterOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = useMemo(() => {
    const s = norm(q.trim());
    const out = links.filter((l) => (!s || norm(l.name).includes(s)) && (!deviceIds.length || deviceIds.includes(l.channel_id)));
    return [...out].sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name) * sort.dir : (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * sort.dir);
  }, [links, q, deviceIds, sort]);

  const filtering = q.trim() !== "" || deviceIds.length > 0;
  const urlOf = (slug: string) => `${window.location.origin}/w/${slug}`;
  const toggleSort = (key: Sort["key"]) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(urlOf(slug));
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setMsg("No se pudo copiar. Abre el enlace con el ojo y cópialo a mano.");
    }
  }

  async function remove(l: Whalink) {
    if (!confirm(`¿Eliminar "${l.name}"? El enlace dejará de funcionar.`)) return;
    const { error } = await createClient().from("whalinks").delete().eq("id", l.id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  const SortBtn = ({ k, label }: { k: Sort["key"]; label: string }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 font-semibold" aria-label={`Ordenar por ${label}`}>
      {label}<span aria-hidden className="text-slate-400">{sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : "⇅"}</span>
    </button>
  );

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Whalink</h1>
          <p className="text-sm text-slate-500">Links que dirigen a iniciar una conversación a tu número de WhatsApp con un mensaje predeterminado.</p>
        </div>
        {isAdmin && (
          <Link href="/whalinks/new" className="shrink-0 rounded-lg bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-600">
            + Crear link
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar por nombre"
          className="w-72 rounded-lg border px-4 py-2.5 text-sm" />
        <div className="ml-auto flex items-center gap-4" ref={filterBox}>
          <button onClick={() => { setQ(""); setDeviceIds([]); }} disabled={!filtering}
            className="text-sm font-semibold text-indigo-600 disabled:opacity-40">Limpiar todos los filtros</button>
          <div className="relative">
            <button onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${deviceIds.length ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}>
              ⏷ Filtrar
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border bg-white p-4 shadow-xl" role="dialog" aria-label="Filtros">
                <p className="mb-2 text-sm font-semibold">Dispositivo</p>
                {channels.length === 0 && <p className="text-xs text-slate-500">Sin canales con número.</p>}
                {channels.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" className="accent-indigo-600" checked={deviceIds.includes(c.id)}
                      onChange={() => setDeviceIds(deviceIds.includes(c.id) ? deviceIds.filter((x) => x !== c.id) : [...deviceIds, c.id])} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {msg && <p className="mb-3 text-sm text-red-600" role="alert">{msg}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b text-slate-800">
              <th className="px-5 py-4"><SortBtn k="name" label="Nombre" /></th>
              <th className="px-5 py-4 font-semibold">Link</th>
              <th className="px-5 py-4 font-semibold">Dispositivo</th>
              <th className="px-5 py-4"><SortBtn k="created_at" label="Fecha de creación" /></th>
              <th className="w-32 px-5 py-4"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                {links.length === 0 ? "Aún no hay links." : "Ningún link coincide con los filtros."}
              </td></tr>
            )}
            {rows.map((l) => (
              <tr key={l.id} className="group border-b last:border-0 hover:bg-slate-50">
                <td className="max-w-[320px] px-5 py-4 font-medium"><span className="block truncate" title={l.name}>{l.name}</span></td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-3 text-slate-700">
                    <span className="truncate">{host}/w/{l.slug}</span>
                    <button onClick={() => copy(l.slug)} aria-label={`Copiar enlace de ${l.name}`} title="Copiar enlace"
                      className="rounded p-1 text-indigo-600 hover:bg-indigo-50">{copied === l.slug ? "✓" : "⧉"}</button>
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${l.channel?.phone_number ? "bg-emerald-500" : "bg-red-700"}`} aria-hidden />
                    {l.channel ? l.channel.name : "Sin dispositivo"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-slate-700">{when(l.created_at)}</td>
                <td className="px-5 py-4">
                  <span className="flex justify-end gap-3 text-lg opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <button onClick={() => setViewing(l)} aria-label={`Ver ${l.name}`} title="Ver detalle">👁</button>
                    {isAdmin && <Link href={`/whalinks/${l.id}/edit`} aria-label={`Editar ${l.name}`} title="Editar">✎</Link>}
                    {isAdmin && <button onClick={() => remove(l)} aria-label={`Eliminar ${l.name}`} title="Eliminar">🗑</button>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">Link</dt>
              <dd className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">{urlOf(viewing.slug)}</code>
                <button onClick={() => copy(viewing.slug)} className="rounded-lg border px-3 py-1 text-xs">{copied === viewing.slug ? "¡Copiado!" : "Copiar"}</button>
              </dd></div>
            <div><dt className="text-xs text-slate-500">Mensaje predeterminado</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-indigo-50 p-3">{viewing.message || <span className="text-slate-400">Sin mensaje</span>}</dd></div>
            <div className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-slate-500">Dispositivo</dt><dd>{viewing.channel?.name} · {viewing.channel?.phone_number}</dd></div>
              <div><dt className="text-xs text-slate-500">Etiqueta al escribir</dt><dd>{viewing.tag_name ?? "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Clics</dt><dd className="text-2xl font-semibold">{viewing.clicks}</dd></div>
              <div><dt className="text-xs text-slate-500">Leads</dt><dd className="text-2xl font-semibold">{viewing.leads}</dd></div>
            </div>
            <p className="text-xs text-slate-500">Creado el {when(viewing.created_at)}. Un lead es quien escribe sin borrar el código <b>(ref:…)</b> del mensaje.</p>
          </dl>
        </Modal>
      )}
    </div>
  );
}
