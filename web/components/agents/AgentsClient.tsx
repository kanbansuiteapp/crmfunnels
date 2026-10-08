"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MODELS, type Agent, type ChannelRow, type Source } from "./types";

const blank = (): Agent => ({
  id: null, name: "", system_prompt: "", model: "gpt-4o-mini", ai_key_set: false, allowed_tags: [], collect_fields: [],
});
const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export function AgentsClient({
  agents, channels, sources, isAdmin,
}: { agents: Agent[]; channels: ChannelRow[]; sources: Source[]; isAdmin: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [draft, setDraft] = useState<Agent | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [kb, setKb] = useState({ kind: "text", title: "", content: "", url: "", q: "", a: "" });
  const [busy, setBusy] = useState(false);

  const fail = (text: string) => setMsg({ ok: false, text });
  const input = "w-full rounded border px-3 py-2 text-sm";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setMsg(null);
    const { data, error } = await supabase.rpc("save_ai_agent", {
      p_id: draft.id, p_name: draft.name, p_prompt: draft.system_prompt, p_model: draft.model,
      p_api_key: apiKey, p_allowed_tags: draft.allowed_tags, p_collect_fields: draft.collect_fields,
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

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        {isAdmin && (
          <button onClick={() => { setDraft(blank()); setMsg(null); }} className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white">
            + Nuevo agente
          </button>
        )}
        <ul className="divide-y rounded-xl border bg-white">
          {agents.length === 0 && <li className="p-4 text-sm text-slate-500">Aún no hay agentes.</li>}
          {agents.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => { setDraft(structuredClone(a)); setApiKey(""); setMsg(null); }}>
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-slate-500">{a.model} · {a.ai_key_set ? "key configurada" : "sin API key"}</p>
              </button>
              {isAdmin && <button aria-label={`Eliminar ${a.name}`} onClick={() => remove(a.id!)}>🗑</button>}
            </li>
          ))}
        </ul>

        <div className="rounded-xl border bg-white p-4">
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
      </aside>

      <section className="space-y-6">
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="alert">{msg.text}</p>}
        {draft ? (
          <>
            <form onSubmit={save} className="space-y-3 rounded-xl border bg-white p-5">
              <div className="flex gap-3">
                <input required disabled={!isAdmin} placeholder="Nombre" value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} />
                <select disabled={!isAdmin} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  className="rounded border px-2 text-sm">
                  {MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <textarea rows={6} disabled={!isAdmin} placeholder="Instrucciones: quién es, qué vende, tono, qué debe preguntar…"
                value={draft.system_prompt} onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })} className={input} />
              <input type="password" disabled={!isAdmin} autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={draft.ai_key_set ? "API key de OpenAI (vacío = conservar la actual)" : "API key de OpenAI (sk-…)"} className={input} />
              <input disabled={!isAdmin} placeholder="Etiquetas que puede aplicar (separadas por coma)"
                value={draft.allowed_tags.join(", ")} onChange={(e) => setDraft({ ...draft, allowed_tags: csv(e.target.value) })} className={input} />
              <input disabled={!isAdmin} placeholder="Datos a capturar del cliente (ej. Talla, Ciudad)"
                value={draft.collect_fields.join(", ")} onChange={(e) => setDraft({ ...draft, collect_fields: csv(e.target.value) })} className={input} />
              {isAdmin && <button className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white">Guardar</button>}
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
                    <button disabled={busy || !draft.ai_key_set} className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {busy ? "Indexando…" : "Añadir fuente"}
                    </button>
                    {!draft.ai_key_set && <p className="text-xs text-slate-500">Guarda primero la API key para poder indexar.</p>}
                  </form>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Elige un agente o crea uno nuevo.</p>
        )}
      </section>
    </div>
  );
}
