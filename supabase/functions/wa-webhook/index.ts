// Webhook de Evolution API: POST /wa-webhook?channel=<id>&secret=<webhook_secret>
import { createClient } from "npm:@supabase/supabase-js@2";
import { tick } from "../_shared/engine.ts";
import { aiRespond } from "../_shared/ai.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channel");
  const secret = url.searchParams.get("secret");
  if (!channelId || !secret) return json({ error: "unauthorized" }, 401);

  const { data: channel } = await admin
    .from("channels").select("id, webhook_secret").eq("id", channelId).maybeSingle();
  if (!channel || channel.webhook_secret !== secret) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const event = String(body?.event ?? "").toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return json({ ok: true, ignored: event });

  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!data || data.key?.fromMe) return json({ ok: true, ignored: "own" });

  const jid: string = data.key?.remoteJid ?? "";
  if (!jid.endsWith("@s.whatsapp.net")) return json({ ok: true, ignored: "not-direct" });

  const m = data.message ?? {};
  const content: string | null =
    m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? null;
  const media = m.imageMessage ? "[imagen]" : m.audioMessage ? "[audio]" : m.documentMessage ? "[documento]" : null;
  if (!content && !media) return json({ ok: true, ignored: "empty" });

  const { data: conversationId, error } = await admin.rpc("ingest_message", {
    p_channel_id: channel.id,
    p_phone: jid.split("@")[0],
    p_name: data.pushName ?? null,
    p_content: content ?? media,
    p_media_url: null,
  });
  if (error) return json({ error: error.message }, 500);

  // whalink: el mensaje trae "(ref:código)" -> cuenta como lead del enlace
  const text = content ?? "";
  const ref = /\(ref:([a-f0-9]{6})\)/i.exec(text);
  if (ref) await admin.rpc("whalink_attribute", { p_conversation: conversationId, p_code: ref[1] });
  // baja: quien escribe STOP no recibirá envíos masivos
  if (/^\s*(stop|baja|cancelar|no molestar)\s*$/i.test(text)) {
    await admin.rpc("mark_do_not_contact", { p_conversation: conversationId });
  }

  // dispara las automatizaciones sin bloquear la respuesta al proveedor
  const bg = Promise.allSettled([tick(admin, 10), aiRespond(admin, conversationId as string)]);
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(bg); else await bg;
  return json({ ok: true });
});
