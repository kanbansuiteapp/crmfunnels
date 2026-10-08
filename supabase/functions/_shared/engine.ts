// Motor de automatizaciones: procesa la cola de eventos y reanuda runs en espera.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mediaTypeOf, sendContact, sendMedia, sendPoll, sendText, toBase64 } from "./provider.ts";

type Step = { type: string; config?: Record<string, any>; then?: Step[]; else?: Step[] };
type Db = SupabaseClient;

const MAX_STEPS = 50;
const nowIso = () => new Date().toISOString();

export async function tick(db: Db, limit = 25): Promise<void> {
  await db.rpc("enqueue_inactivity");

  const { data: events } = await db.rpc("claim_automation_events", { p_limit: limit });
  for (const ev of events ?? []) {
    try {
      await handleEvent(db, ev);
      await db.from("automation_events").update({ processed_at: nowIso(), error: null }).eq("id", ev.id);
    } catch (e) {
      await db.from("automation_events").update({ error: String(e) }).eq("id", ev.id);
    }
  }

  const { data: runs } = await db.rpc("claim_due_runs", { p_limit: limit });
  for (const run of runs ?? []) {
    try {
      await execute(db, run, run.state ?? []);
    } catch (e) {
      await db.from("automation_runs").update({ status: "failed" }).eq("id", run.id);
      console.error("run", run.id, e);
    }
  }
}

// ───────────── eventos → runs ─────────────
function matches(a: any, ev: any): boolean {
  const c = a.conditions ?? {};
  const p = ev.payload ?? {};
  switch (ev.type) {
    case "incoming_message":
      return !c.keyword || String(p.text ?? "").toLowerCase().includes(String(c.keyword).toLowerCase());
    case "tag_added":
      return !c.tag_name || String(p.tag_name ?? "").toLowerCase() === String(c.tag_name).toLowerCase();
    case "webhook":
      return (!c.event || p.event === c.event) && (!c.hook_id || p.hook_id === c.hook_id);
    case "inactivity":
      return p.automation_id === a.id;
    default:
      return false;
  }
}

async function handleEvent(db: Db, ev: any): Promise<void> {
  const { data: autos } = await db.from("automations").select("*")
    .eq("organization_id", ev.organization_id).eq("trigger_type", ev.type).eq("enabled", true);

  for (const a of autos ?? []) {
    if (!matches(a, ev)) continue;
    const steps: Step[] = a.actions_tree_json?.steps ?? [];
    const { data: run, error } = await db.from("automation_runs").insert({
      organization_id: ev.organization_id, automation_id: a.id, contact_id: ev.contact_id,
      conversation_id: ev.conversation_id, event_id: ev.id, status: "running",
      state: steps, context: ev.payload ?? {}, log: [],
    }).select("*").single();
    if (error || !run) throw new Error(error?.message ?? "no se pudo crear el run");
    try {
      await execute(db, run, steps);
    } catch (e) {
      await db.from("automation_runs").update({ status: "failed" }).eq("id", run.id);
      console.error("run", run.id, e);
    }
  }
}

// ───────────── ejecución ─────────────
async function execute(db: Db, run: any, initial: Step[]): Promise<void> {
  const { data: contact } = run.contact_id
    ? await db.from("contacts").select("id, name, phone_number, organization_id").eq("id", run.contact_id).maybeSingle()
    : { data: null };
  const log: any[] = [...(run.log ?? [])];
  let queue: Step[] = [...initial];
  let count = 0;

  const save = (patch: Record<string, unknown>) =>
    db.from("automation_runs").update({ log, ...patch }).eq("id", run.id);

  while (queue.length) {
    const step = queue.shift()!;
    if (++count > MAX_STEPS) {
      log.push({ ok: false, error: "límite de pasos excedido" });
      await save({ status: "failed", state: [] });
      return;
    }

    if (step.type === "wait") {
      const minutes = Math.min(Math.max(Number(step.config?.minutes) || 1, 1), 60 * 24 * 30);
      log.push({ step: "wait", ok: true, minutes });
      await save({ status: "waiting", state: queue, resume_at: new Date(Date.now() + minutes * 60_000).toISOString() });
      return;
    }

    if (step.type === "condition") {
      const ok = await evalCondition(db, step.config ?? {}, contact, run.context ?? {});
      log.push({ step: "condition", ok: true, result: ok });
      queue = [...((ok ? step.then : step.else) ?? []), ...queue];
      continue;
    }

    try {
      const detail = await runAction(db, step, contact, run);
      log.push({ step: step.type, ok: true, detail });
    } catch (e) {
      log.push({ step: step.type, ok: false, error: String(e instanceof Error ? e.message : e) });
      await save({ status: "failed", state: [] });
      return;
    }
  }
  await save({ status: "done", state: [], resume_at: null });
}

async function evalCondition(db: Db, c: Record<string, any>, contact: any, ctx: any): Promise<boolean> {
  const value = String(c.value ?? "").toLowerCase();
  if (c.field === "message_contains") return String(ctx.text ?? "").toLowerCase().includes(value);
  if (c.field === "has_tag" && contact) {
    const { data } = await db.from("contact_tags").select("tag:tags!inner(name)")
      .eq("contact_id", contact.id).ilike("tags.name", String(c.value ?? ""));
    return (data ?? []).length > 0;
  }
  return false;
}

const render = (tpl: string, contact: any) =>
  String(tpl ?? "")
    .replaceAll("{{name}}", contact?.name ?? "")
    .replaceAll("{{phone}}", contact?.phone_number ?? "");

async function runAction(db: Db, step: Step, contact: any, run: any): Promise<string> {
  const cfg = step.config ?? {};
  if (!contact && step.type !== "http_request") throw new Error("la automatización no tiene contacto");

  switch (step.type) {
    case "send_message": {
      const text = render(cfg.text, contact).trim();
      const conv = await ensureConversation(db, contact);

      if (cfg.media_path) {
        // archivo adjunto: se descarga del bucket, se envía y se copia a la carpeta de la conversación
        const path = String(cfg.media_path);
        if (!path.startsWith(`${contact.organization_id}/automations/`)) throw new Error("archivo no válido");
        const dl = await db.storage.from("chat-media").download(path);
        if (dl.error || !dl.data) throw new Error("no se encontró el archivo del paso");
        if (dl.data.size > 16 * 1024 * 1024) throw new Error("archivo demasiado grande");
        const mime = (dl.data.type || String(cfg.media_mime ?? "application/octet-stream")).split(";")[0];
        const type = mediaTypeOf(mime);
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        const name = String(cfg.media_name ?? "archivo").slice(0, 120);
        await sendMedia(conv.channel, contact.phone_number, { type, mime, name, base64: toBase64(bytes), caption: type === "audio" ? "" : text });

        const copy = `${contact.organization_id}/${conv.id}/${crypto.randomUUID()}-${name.replace(/[^\w.-]+/g, "_")}`;
        const up = await db.storage.from("chat-media").upload(copy, bytes, { contentType: mime });
        await db.from("messages").insert({
          organization_id: contact.organization_id, conversation_id: conv.id, contact_id: contact.id,
          direction: "out", content: type === "audio" ? null : text || null, status: "sent",
          ...(up.error ? {} : { media_url: copy, media_type: type, media_mime: mime, media_name: name }),
        });
        return `${type === "image" ? "imagen" : type === "audio" ? "audio" : type === "video" ? "video" : "documento"} enviado`;
      }

      if (!text) throw new Error("mensaje vacío");
      await sendText(conv.channel, contact.phone_number, text);
      // no se actualiza last_message_at: así la inactividad no se reinicia por mensajes automáticos
      await db.from("messages").insert({
        organization_id: contact.organization_id, conversation_id: conv.id, contact_id: contact.id,
        direction: "out", content: text, status: "sent",
      });
      return "mensaje enviado";
    }
    case "add_tag": {
      if (!String(cfg.name ?? "").trim()) throw new Error("etiqueta sin nombre");
      const { error } = await db.rpc("automation_add_tag", { p_contact_id: contact.id, p_name: cfg.name });
      if (error) throw new Error(error.message);
      return `etiqueta ${cfg.name}`;
    }
    case "assign": {
      if (!cfg.agent_id) throw new Error("falta elegir el agente");
      const conv = await ensureConversation(db, contact);
      const { error } = await db.from("conversations").update({ assignee_id: cfg.agent_id }).eq("id", conv.id);
      if (error) throw new Error(error.message);
      return "conversación asignada";
    }
    case "rotator": {
      const conv = await ensureConversation(db, contact);
      const { error } = await db.rpc("assign_round_robin", { p_conversation: conv.id });
      if (error) throw new Error(error.message);
      return "asignada por rotación";
    }
    case "ai": {
      // activa el asistente de IA que tenga el canal de la conversación
      const conv = await ensureConversation(db, contact);
      const { error } = await db.from("conversations").update({ ai_enabled: true }).eq("id", conv.id);
      if (error) throw new Error(error.message);
      return "IA activada";
    }
    case "move_stage":
      return await moveStage(db, contact, cfg);
    case "http_request":
      return await httpRequest(cfg, contact, run);
    default:
      throw new Error(`paso desconocido: ${step.type}`);
  }
}

async function ensureConversation(db: Db, contact: any) {
  let { data: conv } = await db.from("conversations").select("id, channel_id")
    .eq("contact_id", contact.id).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv) {
    const { data: ch } = await db.from("channels").select("id").eq("organization_id", contact.organization_id)
      .order("created_at").limit(1).maybeSingle();
    if (!ch) throw new Error("la organización no tiene canales");
    const { data: created, error } = await db.from("conversations")
      .insert({ organization_id: contact.organization_id, channel_id: ch.id, contact_id: contact.id })
      .select("id, channel_id").single();
    if (error) throw new Error(error.message);
    conv = created;
  }
  const { data: channel } = await db.from("channels").select("api_url, api_key, instance_name")
    .eq("id", conv!.channel_id).single();
  return { id: conv!.id as string, channel: channel! };
}

async function moveStage(db: Db, contact: any, cfg: Record<string, any>): Promise<string> {
  const name = String(cfg.stage_name ?? "").trim();
  if (!name) throw new Error("etapa sin nombre");

  let pipelineId: string | undefined = cfg.pipeline_id;
  if (!pipelineId) {
    const { data: p } = await db.from("pipelines").select("id").eq("organization_id", contact.organization_id)
      .order("created_at").limit(1).maybeSingle();
    pipelineId = p?.id;
  }
  if (!pipelineId) throw new Error("la organización no tiene pipelines");

  const { data: stage } = await db.from("stages").select("id").eq("pipeline_id", pipelineId).ilike("name", name).maybeSingle();
  if (!stage) throw new Error(`etapa "${name}" no existe`);

  let { data: deal } = await db.from("deals").select("id").eq("contact_id", contact.id)
    .eq("pipeline_id", pipelineId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { count } = await db.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", stage.id);
  if (!deal) {
    // se crea en la primera etapa y se mueve con move_deal, para que aplique la etiqueta de la etapa destino
    const { data: first } = await db.from("stages").select("id").eq("pipeline_id", pipelineId)
      .order("order_position").limit(1).single();
    const { count: firstCount } = await db.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", first!.id);
    const { data: created, error } = await db.from("deals").insert({
      organization_id: contact.organization_id, pipeline_id: pipelineId, stage_id: first!.id,
      contact_id: contact.id, title: contact.name || contact.phone_number, position: firstCount ?? 0,
    }).select("id").single();
    if (error) throw new Error(error.message);
    deal = created;
  }
  const { error } = await db.rpc("move_deal", { p_deal_id: deal.id, p_stage_id: stage.id, p_position: count ?? 0 });
  if (error) throw new Error(error.message);
  return `movido a ${name}`;
}

// Solo https hacia hosts públicos (guarda básica contra SSRF; no cubre DNS rebinding)
function assertPublicHttps(raw: string): URL {
  const u = new URL(raw);
  const h = u.hostname.toLowerCase();
  const privateHost =
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "::1" || h.startsWith("[") ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^\d+$/.test(h);
  if (u.protocol !== "https:" || privateHost) throw new Error("URL no permitida (solo https público)");
  return u;
}

async function httpRequest(cfg: Record<string, any>, contact: any, run: any): Promise<string> {
  const u = assertPublicHttps(String(cfg.url ?? ""));
  const method = String(cfg.method ?? "POST").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH"].includes(method)) throw new Error("método no permitido");
  const payload = cfg.body
    ? render(cfg.body, contact)
    : JSON.stringify({ contact: contact && { id: contact.id, name: contact.name, phone: contact.phone_number }, context: run.context });
  const r = await fetch(u, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : payload,
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return `HTTP ${r.status}`;
}

// ───────────── envío masivo ─────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Envía como máximo `per_minute` mensajes por campaña activa, espaciados con algo de azar
// para no disparar los filtros anti-spam de WhatsApp. Se llama una vez por minuto.
export async function runBroadcasts(db: Db): Promise<void> {
  const { data: bcs } = await db.from("broadcasts")
    .select("id, organization_id, channel_id, message, per_minute, media_path, media_name, media_mime").eq("status", "sending")
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);

  for (const b of bcs ?? []) {
    const { data: recipients } = await db.rpc("claim_broadcast_recipients", { p_broadcast: b.id, p_limit: b.per_minute });
    const { data: channel } = await db.from("channels").select("api_url, api_key, instance_name").eq("id", b.channel_id).single();
    const gap = 60_000 / b.per_minute;

    // adjunto del envío: se descarga una sola vez por ronda
    let file: { bytes: Uint8Array; mime: string; type: ReturnType<typeof mediaTypeOf>; name: string } | null = null;
    if (b.media_path && (recipients ?? []).length > 0) {
      const dl = await db.storage.from("chat-media").download(String(b.media_path));
      if (dl.error || !dl.data || !String(b.media_path).startsWith(`${b.organization_id}/broadcasts/`) || dl.data.size > 16 * 1024 * 1024) {
        for (const r of recipients ?? []) await db.rpc("broadcast_mark", { p_recipient: r.id, p_status: "failed", p_error: "archivo adjunto no disponible" });
        continue;
      }
      const mime = (dl.data.type || String(b.media_mime ?? "application/octet-stream")).split(";")[0];
      file = { bytes: new Uint8Array(await dl.data.arrayBuffer()), mime, type: mediaTypeOf(mime), name: String(b.media_name ?? "archivo").slice(0, 120) };
    }

    for (const [i, r] of (recipients ?? []).entries()) {
      if (i > 0) await sleep(Math.round(gap * (0.7 + Math.random() * 0.6)));
      // si la cancelaron mientras tanto, se detiene
      const { data: now } = await db.from("broadcasts").select("status").eq("id", b.id).single();
      if (now?.status !== "sending") {
        await db.from("broadcast_recipients").update({ status: "pending", locked_at: null }).eq("id", r.id);
        continue;
      }
      try {
        const { data: contact } = await db.from("contacts")
          .select("id, name, phone_number, organization_id, do_not_contact").eq("id", r.contact_id).single();
        if (!contact || contact.do_not_contact) {
          await db.rpc("broadcast_mark", { p_recipient: r.id, p_status: "skipped", p_error: "no contactar" });
          continue;
        }
        const text = render(b.message, contact).trim();
        if (file) await sendMedia(channel!, contact.phone_number, { type: file.type, mime: file.mime, name: file.name, base64: toBase64(file.bytes), caption: text });
        else await sendText(channel!, contact.phone_number, text);

        let { data: conv } = await db.from("conversations").select("id")
          .eq("channel_id", b.channel_id).eq("contact_id", contact.id).maybeSingle();
        if (!conv) {
          const { data: created } = await db.from("conversations")
            .insert({ organization_id: contact.organization_id, channel_id: b.channel_id, contact_id: contact.id })
            .select("id").single();
          conv = created;
        }
        if (conv) {
          let media = {};
          if (file) {
            const copy = `${contact.organization_id}/${conv.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
            const up = await db.storage.from("chat-media").upload(copy, file.bytes, { contentType: file.mime });
            if (!up.error) media = { media_url: copy, media_type: file.type, media_mime: file.mime, media_name: file.name };
          }
          await db.from("messages").insert({
            organization_id: contact.organization_id, conversation_id: conv.id, contact_id: contact.id,
            direction: "out", content: text || null, status: "sent", ...media,
          });
        }
        await db.rpc("broadcast_mark", { p_recipient: r.id, p_status: "sent" });
      } catch (e) {
        await db.rpc("broadcast_mark", {
          p_recipient: r.id, p_status: "failed", p_error: String(e instanceof Error ? e.message : e),
        });
      }
    }
  }
}

// ───────────── mensajes programados a grupos ─────────────
type Block = {
  type: "text" | "audio" | "document" | "media" | "link" | "poll" | "contact" | "event";
  text?: string; media_path?: string; media_name?: string; media_mime?: string; mention_all?: boolean;
  poll?: { question: string; options: string[]; multiple?: boolean }; contact?: { name: string; phone: string };
};
type Loaded = { bytes: Uint8Array; mime: string; name: string; type: ReturnType<typeof mediaTypeOf> };

// Próxima fecha de una repetición; si ya quedó atrás, avanza hasta una fecha futura
function nextRun(from: string, freq: string): Date {
  const d = new Date(from);
  const step = () => {
    if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else if (freq === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + 1);
  };
  step();
  while (d.getTime() <= Date.now()) step();
  return d;
}

// Envía los mensajes vencidos. Cada ronda (1 minuto) trabaja hasta ~90 s; lo que falte sigue en la siguiente.
export async function runGroupMessages(db: Db): Promise<void> {
  const started = Date.now();
  const { data: due } = await db.from("group_messages").select("*")
    .in("status", ["scheduled", "sending"]).lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(5);

  for (const m of due ?? []) {
    if (Date.now() - started > 80_000) break;
    if (m.status === "scheduled") {
      const { data: claimed } = await db.from("group_messages").update({ status: "sending" }).eq("id", m.id).eq("status", "scheduled").select("id");
      if (!claimed?.length) continue; // otra ejecución lo tomó
      await db.rpc("refresh_group_message_targets", { p_id: m.id });
    }

    const blocks = (Array.isArray(m.blocks) && m.blocks.length ? m.blocks : [{ type: "text", text: m.message }]) as Block[];
    // archivos: una sola descarga por mensaje y ronda
    const files = new Map<string, Loaded>();
    let fileError: string | null = null;
    for (const b of blocks) {
      if (!b.media_path || files.has(b.media_path)) continue;
      const path = String(b.media_path);
      const dl = path.startsWith(`${m.organization_id}/group-messages/`) ? await db.storage.from("chat-media").download(path) : null;
      if (!dl || dl.error || !dl.data || dl.data.size > 16 * 1024 * 1024) { fileError = "archivo adjunto no disponible"; break; }
      const mime = (dl.data.type || String(b.media_mime ?? "application/octet-stream")).split(";")[0];
      files.set(path, { bytes: new Uint8Array(await dl.data.arrayBuffer()), mime, name: String(b.media_name ?? "archivo").slice(0, 120), type: mediaTypeOf(mime) });
    }

    const { data: targets } = await db.from("group_message_targets")
      .select("id, group:wa_groups(jid, channel:channels(api_url, api_key, instance_name))")
      .eq("message_id", m.id).eq("status", "pending").limit(200);

    let first = true;
    for (const t of targets ?? []) {
      if (Date.now() - started > 90_000) break;
      if (!first) await sleep(m.speed === "slow" ? 10_000 + Math.round(Math.random() * 5_000) : 3_000);
      first = false;
      // si la cancelaron o borraron mientras tanto, se detiene
      const { data: now } = await db.from("group_messages").select("status").eq("id", m.id).maybeSingle();
      if (now?.status !== "sending") break;
      try {
        if (fileError) throw new Error(fileError);
        // deno-lint-ignore no-explicit-any
        const g = t.group as any;
        if (!g?.jid || !g?.channel) throw new Error("grupo o número no disponible");
        for (const [i, b] of blocks.entries()) {
          if (i > 0) await sleep(1_200);
          const text = String(b.text ?? "");
          if (b.type === "poll" && b.poll) await sendPoll(g.channel, g.jid, { question: b.poll.question, options: b.poll.options, multiple: !!b.poll.multiple });
          else if (b.type === "contact" && b.contact) await sendContact(g.channel, g.jid, b.contact);
          else if (b.media_path) {
            const f = files.get(String(b.media_path))!;
            await sendMedia(g.channel, g.jid, { type: f.type, mime: f.mime, name: f.name, base64: toBase64(f.bytes), caption: f.type === "audio" ? "" : text });
          } else await sendText(g.channel, g.jid, text, { mentionAll: !!b.mention_all });
        }
        await db.from("group_message_targets").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", t.id);
      } catch (e) {
        await db.from("group_message_targets").update({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 300) }).eq("id", t.id);
      }
    }

    const count = async (status: string) =>
      (await db.from("group_message_targets").select("id", { count: "exact", head: true }).eq("message_id", m.id).eq("status", status)).count ?? 0;
    const [pending, sent, failed] = await Promise.all([count("pending"), count("sent"), count("failed")]);
    if (pending > 0) { await db.from("group_messages").update({ sent, failed }).eq("id", m.id).eq("status", "sending"); continue; }

    // terminó esta vuelta: ¿se repite?
    const runs = (m.runs_done ?? 0) + 1;
    let again = false;
    let next: Date | null = null;
    if (m.repeat_enabled) {
      next = nextRun(m.scheduled_at, m.repeat_frequency);
      again = m.repeat_end === "never"
        || (m.repeat_end === "after" && runs < (m.repeat_after ?? 1))
        || (m.repeat_end === "date" && !!m.repeat_until && next.getTime() <= new Date(m.repeat_until).getTime());
    }
    if (again && next) {
      await db.from("group_message_targets").update({ status: "pending", error: null, sent_at: null }).eq("message_id", m.id);
      await db.from("group_messages").update({ status: "scheduled", scheduled_at: next.toISOString(), runs_done: runs, sent: 0, failed: 0 }).eq("id", m.id).eq("status", "sending");
    } else {
      await db.from("group_messages").update({ sent, failed, runs_done: runs, status: sent === 0 && failed > 0 ? "failed" : "done" }).eq("id", m.id).eq("status", "sending");
    }
  }
}
