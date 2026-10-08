"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnPrimary, Check, FilterButton, Modal, Page, ROW, SearchBox, TABLE, Th, Toolbar } from "@/components/settings/kit";

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

export function WhalinksClient({ links, channels, isAdmin }: { links: Whalink[]; channels: Channel[]; isAdmin: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "created_at", dir: -1 });
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
    const [viewing, setViewing] = useState<Whalink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [host, setHost] = useState(""); // el dominio se conoce solo en el navegador

  useEffect(() => setHost(window.location.host), []);
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
    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-semibold" aria-label={`Ordenar por ${label}`}>
      {label}<Icon name="sort" size={16} />
    </button>
  );

  return (
    <Page title="Whalink" subtitle="Links que dirigen a iniciar una conversación a tu número de WhatsApp con un mensaje predeterminado."
      actions={isAdmin ? <Link href="/whalinks/new" className={btnPrimary}><span className="text-lg leading-none">+</span> Crear link</Link> : undefined}>
      <Toolbar
        left={<SearchBox value={q} onChange={setQ} />}
        onClear={() => { setQ(""); setDeviceIds([]); }}
        filter={
          <FilterButton active={deviceIds.length > 0}>
            <p className="mb-3 text-sm font-semibold">Dispositivo</p>
            {channels.length === 0 && <p className="text-xs text-slate-500">Sin canales con número.</p>}
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                <Check label={c.name} checked={deviceIds.includes(c.id)} onChange={() => setDeviceIds(deviceIds.includes(c.id) ? deviceIds.filter((x) => x !== c.id) : [...deviceIds, c.id])} />
                {c.name}
              </label>
            ))}
          </FilterButton>
        } />

      <Alert text={msg} />
      <p className="mt-6 text-base font-semibold text-slate-900">Total de links {links.length}{filtering ? ` · ${rows.length} coinciden` : ""}</p>

      <div className="scroll-x">
        <table className={`${TABLE} min-w-[760px]`}>
          <thead>
            <tr>
              <Th><SortBtn k="name" label="Nombre" /></Th>
              <Th>Link</Th>
              <Th>Dispositivo</Th>
              <Th><SortBtn k="created_at" label="Fecha de creación" /></Th>
              <th className="w-32 px-3 py-4"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-16 text-center text-slate-500">
                {links.length === 0 ? "Aún no hay links. Usa “Crear link” para añadir el primero." : "Ningún link coincide con los filtros."}
              </td></tr>
            )}
            {rows.map((l) => (
              <tr key={l.id} className={`group ${ROW}`}>
                <td className="max-w-[320px] px-3 py-3 font-medium text-slate-700"><span className="block truncate" title={l.name}>{l.name}</span></td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="truncate">{host}/w/{l.slug}</span>
                    <button onClick={() => copy(l.slug)} aria-label={`Copiar enlace de ${l.name}`} title="Copiar enlace"
                      className="rounded p-1 text-indigo-600 hover:bg-indigo-50">{copied === l.slug ? "✓" : <Icon name="copy" size={16} />}</button>
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${l.channel?.phone_number ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
                    {l.channel ? l.channel.name : "Sin dispositivo"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{when(l.created_at)}</td>
                <td className="px-3 py-3">
                  <span className="flex justify-end gap-3 text-slate-500 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <button onClick={() => setViewing(l)} aria-label={`Ver ${l.name}`} title="Ver detalle" className="hover:text-indigo-600"><Icon name="eye" size={18} /></button>
                    {isAdmin && <Link href={`/whalinks/${l.id}/edit`} aria-label={`Editar ${l.name}`} title="Editar" className="hover:text-indigo-600"><Icon name="pencil" size={18} /></Link>}
                    {isAdmin && <button onClick={() => remove(l)} aria-label={`Eliminar ${l.name}`} title="Eliminar" className="hover:text-red-600"><Icon name="trash" size={18} /></button>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <dl className="space-y-4 text-sm">
            <div><dt className="text-xs font-semibold text-slate-500">Link</dt>
              <dd className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-xs">{urlOf(viewing.slug)}</code>
                <button onClick={() => copy(viewing.slug)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50">{copied === viewing.slug ? "¡Copiado!" : "Copiar"}</button>
              </dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Mensaje predeterminado</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-indigo-50 p-3">{viewing.message || <span className="text-slate-400">Sin mensaje</span>}</dd></div>
            <div className="grid grid-cols-2 gap-4">
              <div><dt className="text-xs font-semibold text-slate-500">Dispositivo</dt><dd>{viewing.channel?.name} · {viewing.channel?.phone_number}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Etiqueta al escribir</dt><dd>{viewing.tag_name ?? "—"}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Clics</dt><dd className="text-2xl font-semibold">{viewing.clicks}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Leads</dt><dd className="text-2xl font-semibold">{viewing.leads}</dd></div>
            </div>
            <p className="text-xs text-slate-500">Creado el {when(viewing.created_at)}. Un lead es quien escribe sin borrar el código <b>(ref:…)</b> del mensaje.</p>
          </dl>
        </Modal>
      )}
    </Page>
  );
}
