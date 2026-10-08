// Alta de una fuente de conocimiento: { agent_id, kind: 'text'|'faq'|'url', title, content? , url? }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { embed } from "../_shared/ai.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_CHUNKS = 200;
const MAX_BYTES = 1_000_000;

function publicHttps(raw: string): URL {
  const u = new URL(raw);
  const h = u.hostname.toLowerCase();
  const bad = h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "::1" || h.startsWith("[") ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^\d+$/.test(h);
  if (u.protocol !== "https:" || bad) throw new Error("URL no permitida (solo https público)");
  return u;
}

function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

// trozos de ~800 caracteres cortando por párrafos
function chunk(text: string, size = 800): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of text.split(/\n\s*\n/)) {
    if ((cur + "\n\n" + p).length > size && cur) { out.push(cur.trim()); cur = ""; }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size).trim());
    } else cur += (cur ? "\n\n" : "") + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await user.auth.getUser();
  if (!u.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await admin.from("profiles").select("organization_id, role").eq("id", u.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Solo administradores" }, 403);

  const body = await req.json().catch(() => ({}));
  const { data: agent } = await admin.from("ai_agents").select("id, api_key")
    .eq("id", body.agent_id).eq("organization_id", me.organization_id).maybeSingle();
  if (!agent) return json({ error: "Agente no encontrado" }, 404);
  if (!agent.api_key) return json({ error: "Configura primero la API key de OpenAI del agente" }, 400);

  let text = "";
  try {
    if (body.kind === "url") {
      const r = await fetch(publicHttps(String(body.url ?? "")), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`la página respondió ${r.status}`);
      const raw = (await r.text()).slice(0, MAX_BYTES);
      text = htmlToText(raw);
    } else if (body.kind === "text" || body.kind === "faq") {
      text = String(body.content ?? "").slice(0, MAX_BYTES);
    } else return json({ error: "Tipo no soportado" }, 400);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }

  const chunks = chunk(text).slice(0, MAX_CHUNKS);
  if (chunks.length === 0) return json({ error: "No hay contenido para indexar" }, 400);

  try {
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += 64) vectors.push(...await embed(agent.api_key, chunks.slice(i, i + 64)));

    const { data: src, error } = await admin.from("knowledge_sources").insert({
      organization_id: me.organization_id, agent_id: agent.id, kind: body.kind,
      title: String(body.title ?? body.url ?? "Sin título").slice(0, 200),
    }).select("id").single();
    if (error) throw new Error(error.message);

    const rows = chunks.map((content, i) => ({
      organization_id: me.organization_id, source_id: src.id, content, embedding: JSON.stringify(vectors[i]),
    }));
    const { error: cErr } = await admin.from("knowledge_chunks").insert(rows);
    if (cErr) {
      await admin.from("knowledge_sources").delete().eq("id", src.id); // sin fuentes a medias
      throw new Error(cErr.message);
    }
    return json({ ok: true, chunks: chunks.length });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
