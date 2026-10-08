"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelRef, Conversation, Member } from "./types";

type Tab = "all" | "mine" | "fav";
type Status = "all" | "unread" | "open" | "closed";

const AVATAR = ["#2a78d6", "#eb6834", "#1baf7a", "#8b5cf6", "#e87ba4", "#0f766e", "#b45309"];
const colorOf = (s: string) => AVATAR[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
const initials = (n: string) => n.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "#";

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ConversationList({
  conversations, selected, onSelect, onToggleFavorite, onMarkAllRead, onNew, meId, team, channels,
}: {
  conversations: Conversation[]; selected: string | null; meId: string; team: Member[]; channels: ChannelRef[];
  onSelect: (id: string) => void; onToggleFavorite: (id: string) => void; onMarkAllRead: () => void;
  onNew: (channel: string, phone: string, name: string) => Promise<string | null>;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [panel, setPanel] = useState<"filter" | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [nw, setNw] = useState({ channel: channels[0]?.id ?? "", phone: "", name: "" });
  const [nwErr, setNwErr] = useState<string | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setPanel(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const allTags = useMemo(() => {
    const m = new Map<string, string>();
    conversations.forEach((c) => c.tags.forEach((t) => m.set(t.id, t.name)));
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations]);

  const list = useMemo(() => {
    const s = norm(q.trim());
    const out = conversations.filter((c) => {
      if (tab === "mine" && c.assignee_id !== meId) return false;
      if (tab === "fav" && !c.favorite) return false;
      if (status === "unread" && c.unread_count === 0) return false;
      if (status === "open" && c.status !== "open") return false;
      if (status === "closed" && c.status !== "closed") return false;
      if (tagIds.length && !c.tags.some((t) => tagIds.includes(t.id))) return false;
      if (agentIds.length && !agentIds.includes(c.assignee_id ?? "none")) return false;
      if (channelIds.length && !channelIds.includes(c.channel.id)) return false;
      if (s && !norm(`${c.contact.name ?? ""} ${c.contact.phone_number}`).includes(s)) return false;
      return true;
    });
    return oldestFirst ? [...out].reverse() : out;
  }, [conversations, tab, q, status, tagIds, agentIds, channelIds, oldestFirst, meId]);

  const filtering = status !== "all" || tagIds.length + agentIds.length + channelIds.length > 0;
  const toggle = (set: string[], v: string, fn: (x: string[]) => void) =>
    fn(set.includes(v) ? set.filter((x) => x !== v) : [...set, v]);
  const unreadTotal = conversations.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0);

  async function createNew(e: React.FormEvent) {
    e.preventDefault();
    setNwErr(null);
    const err = await onNew(nw.channel, nw.phone, nw.name);
    if (err) return setNwErr(err);
    setNw({ ...nw, phone: "", name: "" });
    setPanel(null);
  }

  const STATUS: { v: Status; label: string }[] = [
    { v: "unread", label: "Conversaciones no leídas" },
    { v: "open", label: "Conversaciones abiertas" },
    { v: "closed", label: "Conversaciones cerradas" },
    { v: "all", label: "Todas las conversaciones" },
  ];

  const Group = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-t">
      <button type="button" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}
        className="flex w-full items-center justify-between py-3 text-sm font-semibold">
        {title}<span aria-hidden className="text-slate-400">{open === id ? "⌃" : "⌄"}</span>
      </button>
      {open === id && <div className="max-h-40 space-y-1 overflow-y-auto pb-3">{children}</div>}
    </div>
  );
  const Check = ({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) => (
    <label className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-indigo-600" />{label}
    </label>
  );

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center border-b px-2">
        {([["all", "Todos"], ["mine", "Mis chats"], ["fav", "Favoritos"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`px-4 py-3 text-sm font-medium ${tab === k ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500"}`}>
            {label}
          </button>
        ))}
        <button onClick={() => setPanel(panel === "new" ? null : "new")} aria-label="Nueva conversación" title="Nueva conversación"
          className="ml-auto mr-1 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-lg leading-none text-white">+</button>
      </div>

      <div ref={box} className="relative flex items-center gap-2 border-b p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar contactos" aria-label="Buscar contactos"
          className="min-w-0 flex-1 rounded-lg border bg-slate-50 px-3 py-2 text-sm" />
        <button onClick={() => setPanel(panel === "filter" ? null : "filter")} aria-label="Filtros" aria-expanded={panel === "filter"} title="Filtros"
          className={`h-9 w-9 rounded-lg ${filtering ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>⏷</button>
        <button onClick={() => setOldestFirst(!oldestFirst)} aria-label="Cambiar orden" title={oldestFirst ? "Más antiguos primero" : "Más recientes primero"}
          className="h-9 w-9 rounded-lg bg-slate-100 text-slate-600">{oldestFirst ? "↑" : "↓"}</button>
        <button onClick={onMarkAllRead} disabled={unreadTotal === 0} aria-label="Marcar todo como leído" title="Marcar todo como leído"
          className="h-9 w-9 rounded-lg bg-slate-100 text-slate-600 disabled:opacity-40">✓✓</button>

        {panel === "filter" && (
          <div className="absolute left-3 top-14 z-20 w-72 rounded-xl border bg-white p-4 shadow-xl" role="dialog" aria-label="Filtros">
            <div role="radiogroup" className="space-y-3 pb-3">
              {STATUS.map((s) => (
                <label key={s.v} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="radio" name="status" checked={status === s.v} onChange={() => setStatus(s.v)} className="accent-indigo-600" />
                  {s.label}
                </label>
              ))}
            </div>
            <Group id="tags" title="Tags">
              {allTags.length === 0 && <p className="text-xs text-slate-500">Sin etiquetas.</p>}
              {allTags.map((t) => <Check key={t.id} label={t.name} checked={tagIds.includes(t.id)} onChange={() => toggle(tagIds, t.id, setTagIds)} />)}
            </Group>
            <Group id="agents" title="Agentes">
              <Check label="Sin asignar" checked={agentIds.includes("none")} onChange={() => toggle(agentIds, "none", setAgentIds)} />
              {team.map((m) => <Check key={m.id} label={m.name} checked={agentIds.includes(m.id)} onChange={() => toggle(agentIds, m.id, setAgentIds)} />)}
            </Group>
            <Group id="channels" title="Por dispositivo">
              {channels.map((c) => <Check key={c.id} label={c.name} checked={channelIds.includes(c.id)} onChange={() => toggle(channelIds, c.id, setChannelIds)} />)}
            </Group>
            {filtering && (
              <button onClick={() => { setStatus("all"); setTagIds([]); setAgentIds([]); setChannelIds([]); }}
                className="mt-1 w-full rounded-lg border py-2 text-sm text-indigo-700">Limpiar filtros</button>
            )}
          </div>
        )}

        {panel === "new" && (
          <form onSubmit={createNew} className="absolute left-3 right-3 top-14 z-20 space-y-2 rounded-xl border bg-white p-4 shadow-xl">
            <p className="text-sm font-semibold">Nueva conversación</p>
            {channels.length > 1 && (
              <select aria-label="Canal" value={nw.channel} onChange={(e) => setNw({ ...nw, channel: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm">
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <input required type="tel" placeholder="Teléfono con código (+51…)" value={nw.phone} onChange={(e) => setNw({ ...nw, phone: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input placeholder="Nombre (opcional)" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
            {nwErr && <p className="text-xs text-red-600" role="alert">{nwErr}</p>}
            <button className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white">Abrir chat</button>
          </form>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-500">
            {conversations.length === 0 ? "Aún no hay conversaciones." : "Ninguna conversación coincide con los filtros."}
          </li>
        )}
        {list.map((c) => {
          const name = c.contact.name ?? c.contact.phone_number;
          const lm = c.last_message;
          return (
            <li key={c.id} className={`group relative border-b ${selected === c.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <button onClick={() => onSelect(c.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: colorOf(name) }}>
                  {initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    <span className="shrink-0 text-xs text-slate-400">› {c.assignee_name ?? "Sin asignar"}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-slate-500">
                    {lm ? <>{lm.direction === "out" && <span className="text-slate-400">{lm.by_ai ? "🤖 " : "✓ "}</span>}{lm.content ?? "Mensaje multimedia"}</> : "Sin mensajes todavía"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-slate-400">{when(c.last_message_at)}</span>
                  {c.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white"
                      aria-label={`${c.unread_count} sin leer`}>{c.unread_count}</span>
                  )}
                  {c.status === "closed" && <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">cerrado</span>}
                </span>
              </button>
              <button onClick={() => onToggleFavorite(c.id)} aria-label={c.favorite ? "Quitar de favoritos" : "Añadir a favoritos"} aria-pressed={c.favorite}
                className={`absolute left-1 top-1 text-sm ${c.favorite ? "text-amber-500" : "text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100"}`}>
                {c.favorite ? "★" : "☆"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
