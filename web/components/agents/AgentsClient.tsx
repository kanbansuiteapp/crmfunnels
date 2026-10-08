"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MODELS, OBJECTIVES, type Agent, type ChannelRow, type Source } from "./types";

const blank = (): Agent => ({
  id: null, name: "", system_prompt: "", model: "gpt-4o-mini", ai_key_set: false, allowed_tags: [], collect_fields: [],
  description: "", objective: "", active: true,
});
type ColKey = "description" | "objective" | "status";
const COLS: { key: ColKey; label: string }[] = [
  { key: "description", label: "Descripción" }, { key: "objective", label: "Objetivo" }, { key: "status", label: "Estado" },
];
const mb = (b: number) => `${(b / 1_048_576).toFixed(2)} MB`;
const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export function AgentsClient({
  agents, channels, sources, kbBytes, isAdmin,
}: { agents: Agent[]; channels: ChannelRow[]; sources: Source[]; kbBytes: number; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [draft, setDraft] = useState<Agent | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [kb, setKb] = useState({ kind: "text", title: "", content: "", url: "", q: "", a: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const [sort, setSort] = useState<{ key: "name" | "active"; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [cols, setCols] = useState<Record<ColKey, boolean>>({ description: true, objective: true, status: true });
  const [colsOpen, setColsOpen] = useState(false);
  const colsBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => colsBox.current && !colsBox.current.contains(e.target as Node) && setColsOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return agents
      .filter((a) => (filter === "all" || (filter === "on") === a.active) && (!s || `${a.name} ${a.description}`.toLowerCase().includes(s)))
      .sort((a, b) => (sort.key === "name" ? a.name.localeCompare(b.name) : Number(a.active) - Number(b.active)) * sort.dir);
  }, [agents, q, filter, sort]);
  const toggleSort = (key: "name" | "active") => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  const fail = (text: string) => setMsg({ ok: false, text });
  const input = "w-full rounded border px-3 py-2 text-sm";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setMsg(null);
    const { data, error } = await supabase.rpc("save_ai_agent", {
      p_id: draft.id, p_name: draft.name, p_prompt: draft.system_prompt, p_model: draft.model,
      p_api_key: apiKey, p_allowed_tags: draft.allowed_tags, p_collect_fields: draft.collect_fields,
      p_description: draft.description, p_objective: draft.objective, p_active: draft.active,
    });
    if (error) return fail(error.message);
    setApiKey("");
    setDraft({ ...draft, id: data as string, ai_key_set: draft.ai_key_set || apiKey.trim() !== "" });
    setMsg({ ok: true, text: "Guardado." });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este agente y su base de conocimiento?")) return;
    const { error } = await supabase.from("ai_agents").delete().eq("id", id);
    if (error) return fail(error.message);
    setDraft(null);
    router.refresh();
  }

  async function duplicate(id: string) {
    const { error } = await supabase.rpc("duplicate_ai_agent", { p_id: id });
    if (error) return fail(error.message);
    router.refresh();
  }

  async function assign(channelId: string, agentId: string) {
    const { error } = await supabase.rpc("set_channel_agent", { p_channel_id: channelId, p_agent_id: agentId || null });
    if (error) fail(error.message);
    router.refresh();
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!draft?.id) return;
    setBusy(true);
    setMsg(null);
    const content = kb.kind === "faq" ? `Pregunta: ${kb.q}\nRespuesta: ${kb.a}` : kb.content;
    const { data, error } = await supabase.functions.invoke("kb-ingest", {
      body: { agent_id: draft.id, kind: kb.kind, title: kb.title || kb.q, content, url: kb.url },
    });
    setBusy(false);
    if (error || data?.error) return fail(data?.error ?? "No se pudo indexar la fuente.");
    setMsg({ ok: true, text: `Fuente indexada (${data.chunks} fragmentos).` });
    setKb({ ...kb, title: "", content: "", url: "", q: "", a: "" });
    router.refresh();
  }

  async function removeSource(id: string) {
    const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
    if (error) fail(error.message);
    router.refresh();
  }

  const mySources = sources.filter((s) => s.agent_id === draft?.id);

  const th = "px-5 py-4 text-xs font-medium uppercase tracking-wide text-slate-500";

  if (draft) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <button onClick={() => { setDraft(null); setMsg(null); }} className="text-sm font-medium text-indigo-600 hover:underline">← Regresar</button>
          <h1 className="mt-2 text-2xl font-semibold">{draft.id ? draft.name || "Agente" : "Crear agente"}</h1>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="alert">{msg.text}</p>}
            <form onSubmit={save} className="space-y-3 rounded-xl border bg-white p-5">
              <div className="flex gap-3">
                <input required disabled={!isAdmin} placeholder="Nombre" value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} />
                <select disabled={!isAdmin} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  className="rounded border px-2 text-sm">
                  {MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <input disabled={!isAdmin} maxLength={500} placeholder="Descripción corta (se muestra en la lista)"
                value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={input} />
              <div className="flex flex-wrap items-center gap-3">
                <select disabled={!isAdmin} aria-label="Objetivo" value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
                  className="rounded border px-2 py-2 text-sm">
                  <option value="">Objetivo…</option>
                  {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!isAdmin} checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                  Agente activo
                </label>
              </div>
              <textarea rows={6} disabled={!isAdmin} placeholder="Instrucciones: quién es, qué vende, tono, qué debe preguntar…"
                value={draft.system_prompt} onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })} className={input} />
              <input type="password" disabled={!isAdmin} autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={draft.ai_key_set ? "API key de OpenAI (vacío = conservar la actual)" : "API key de OpenAI (sk-…)"} className={input} />
              <input disabled={!isAdmin} placeholder="Etiquetas que puede aplicar (separadas por coma)"
                value={draft.allowed_tags.join(", ")} onChange={(e) => setDraft({ ...draft, allowed_tags: csv(e.target.value) })} className={input} />
              <input disabled={!isAdmin} placeholder="Datos a capturar del cliente (ej. Talla, Ciudad)"
                value={draft.collect_fields.join(", ")} onChange={(e) => setDraft({ ...draft, collect_fields: csv(e.target.value) })} className={input} />
              {isAdmin && <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Guardar</button>}
            </form>

            {draft.id && (
              <div className="space-y-3 rounded-xl border bg-white p-5">
                <h2 className="text-sm font-semibold">Base de conocimiento</h2>
                <ul className="divide-y text-sm">
                  {mySources.length === 0 && <li className="py-2 text-slate-500">Sin fuentes.</li>}
                  {mySources.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-2">
                      <span className="truncate"><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.kind}</span>{s.title}</span>
                      {isAdmin && <button aria-label="Quitar fuente" onClick={() => removeSource(s.id)}>✕</button>}
                    </li>
                  ))}
                </ul>
                {isAdmin && (
                  <form onSubmit={addSource} className="space-y-2">
                    <div className="flex gap-2">
                      <select value={kb.kind} onChange={(e) => setKb({ ...kb, kind: e.target.value })} className="rounded border px-2 py-2 text-sm">
                        <option value="text">Texto</option>
                        <option value="faq">Pregunta frecuente</option>
                        <option value="url">Página web</option>
                      </select>
                      {kb.kind !== "faq" && (
                        <input placeholder="Título" value={kb.title} onChange={(e) => setKb({ ...kb, title: e.target.value })} className={input} />
                      )}
                    </div>
                    {kb.kind === "text" && (
                      <textarea required rows={5} placeholder="Catálogo, precios, políticas…" value={kb.content}
                        onChange={(e) => setKb({ ...kb, content: e.target.value })} className={input} />
                    )}
                    {kb.kind === "url" && (
                      <input required type="url" placeholder="https://…" value={kb.url}
                        onChange={(e) => setKb({ ...kb, url: e.target.value })} className={input} />
                    )}
                    {kb.kind === "faq" && (
                      <>
                        <input required placeholder="Pregunta" value={kb.q} onChange={(e) => setKb({ ...kb, q: e.target.value })} className={input} />
                        <textarea required rows={3} placeholder="Respuesta" value={kb.a} onChange={(e) => setKb({ ...kb, a: e.target.value })} className={input} />
                      </>
                    )}
                    <button disabled={busy || !draft.ai_key_set} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {busy ? "Indexando…" : "Añadir fuente"}
                    </button>
                    {!draft.ai_key_set && <p className="text-xs text-slate-500">Guarda primero la API key para poder indexar.</p>}
                  </form>
                )}
              </div>
            )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            Agentes de IA <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">BETA</span>
          </h1>
          <p className="text-sm text-slate-500">Gestiona tus agentes{!isAdmin && " · solo los administradores pueden editarlos"}</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setDraft(blank()); setApiKey(""); setMsg(null); }}
            className="shrink-0 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700">+ Crear Agente</button>
        )}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          { icon: "🤖", value: String(agents.length), label: "Total de agentes" },
          { icon: "✅", value: String(agents.filter((a) => a.active).length), label: "Agentes activos" },
          { icon: "🗄️", value: mb(kbBytes), label: "Base de conocimiento" },
        ].map((c) => (
          <div key={c.label} className="flex items-center gap-4 rounded-2xl border bg-white p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl" aria-hidden>{c.icon}</span>
            <div><p className="text-2xl font-semibold">{c.value}</p><p className="text-sm text-slate-500">{c.label}</p></div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <input type="search" aria-label="Buscar agentes" placeholder="Buscar agentes..." value={q} onChange={(e) => setQ(e.target.value)}
            className="w-64 rounded-full border bg-white px-4 py-2.5 text-sm" />
          <select aria-label="Filtrar por estado" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-full border bg-white px-4 py-2.5 text-sm">
            <option value="all">Todos</option><option value="on">Activos</option><option value="off">Inactivos</option>
          </select>
        </div>
        <div className="relative" ref={colsBox}>
          <button onClick={() => setColsOpen((v) => !v)} aria-expanded={colsOpen} className="rounded-full border bg-white px-4 py-2.5 text-sm">Columnas ⌄</button>
          {colsOpen && (
            <ul className="absolute right-0 z-20 mt-2 w-44 rounded-xl border bg-white py-2 shadow-lg">
              {COLS.map((c) => (
                <li key={c.key}>
                  <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={cols[c.key]} onChange={() => setCols({ ...cols, [c.key]: !cols[c.key] })} /> {c.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {msg && <p className={`mb-3 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="alert">{msg.text}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}><button onClick={() => toggleSort("name")} className="uppercase">Nombre ⇅</button></th>
              {cols.description && <th className={th}>Descripción</th>}
              {cols.objective && <th className={th}>Objetivo</th>}
              {cols.status && <th className={th}><button onClick={() => toggleSort("active")} className="uppercase">Estado ⇅</button></th>}
              <th className={th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                {agents.length === 0 ? "Aún no hay agentes." : "Ningún agente coincide con la búsqueda."}
              </td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-5 py-4">
                  <button onClick={() => { setDraft(structuredClone(a)); setApiKey(""); setMsg(null); }} className="flex items-center gap-3 text-left font-medium">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm">{a.name.charAt(0).toUpperCase()}</span>
                    {a.name}
                  </button>
                </td>
                {cols.description && <td className="max-w-xs truncate px-5 py-4 text-slate-500" title={a.description}>{a.description || a.system_prompt.slice(0, 60) || "—"}</td>}
                {cols.objective && <td className="px-5 py-4">{a.objective ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{a.objective}</span> : "—"}</td>}
                {cols.status && (
                  <td className="px-5 py-4">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${a.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                      {a.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                )}
                <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                  <button aria-label={`Editar ${a.name}`} title="Editar" className="mr-3" onClick={() => { setDraft(structuredClone(a)); setApiKey(""); setMsg(null); }}>✏️</button>
                  {isAdmin && <button aria-label={`Duplicar ${a.name}`} title="Duplicar" className="mr-3" onClick={() => duplicate(a.id!)}>⧉</button>}
                  {isAdmin && <button aria-label={`Eliminar ${a.name}`} title="Eliminar" onClick={() => remove(a.id!)}>🗑</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 max-w-xl rounded-2xl border bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold">Agente por canal</h2>
        {channels.length === 0 && <p className="text-xs text-slate-500">Conecta un canal en la bandeja primero.</p>}
        {channels.map((c) => (
          <label key={c.id} className="mb-2 block text-xs text-slate-600">
            {c.name}
            <select disabled={!isAdmin} value={c.ai_agent_id ?? ""} onChange={(e) => assign(c.id, e.target.value)}
              className="mt-0.5 w-full rounded border px-2 py-1 text-sm">
              <option value="">Sin IA</option>
              {agents.map((a) => <option key={a.id} value={a.id!}>{a.name}</option>)}
            </select>
          </label>
        ))}
        <p className="text-xs text-slate-500">Los chats nuevos de ese canal empiezan con la IA activa. Si una persona escribe, la IA se pausa en ese chat.</p>
      </div>
    </div>
  );
}
