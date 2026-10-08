// Webhook de Evolution API: POST /wa-webhook?channel=<id>&secret=<webhook_secret>
import { createClient } from "npm:@supabase/supabase-js@2";
import { tick } from "../_shared/engine.ts";
import { aiRespond } from "../_shared/ai.ts";
import { fetchIncomingMedia, sendText, type MediaType } from "../_shared/provider.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const MAX_BYTES = 16 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "audio/webm": "webm", "video/mp4": "mp4", "application/pdf": "pdf",
};

// Descarga el archivo desde Evolution, lo guarda en el bucket privado y lo enlaza al mensaje recibido
async function saveMedia(conversationId: string, channelId: string, keyId: string, kind: MediaType, node: any) {
  const { data: ch } = await admin.from("channels").select("api_url, api_key, instance_name").eq("id", channelId).single();
  const { data: conv } = await admin.from("conversations").select("organization_id").eq("id", conversationId).single();
  if (!ch || !conv) return;

  const mime0 = String(node?.mimetype ?? "").split(";")[0] || undefined;
  const got = await fetchIncomingMedia(ch, keyId, node?.base64, mime0);
  if (got.bytes.length === 0 || got.bytes.length > MAX_BYTES) throw new Error("archivo vacío o demasiado grande");

  const mime = (got.mime || "application/octet-stream").split(";")[0];
  const ext = EXT[mime] ?? (node?.fileName?.split(".").pop() ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5);
  const path = `${conv.organization_id}/${conversationId}/${crypto.randomUUID()}.${ext}`;
  const up = await admin.storage.from("chat-media").upload(path, got.bytes, { contentType: mime });
  if (up.error) throw new Error(up.error.message);

  // el mensaje recién guardado por ingest_message: el último entrante sin archivo en esta conversación
  const { data: msg } = await admin.from("messages").select("id").eq("conversation_id", conversationId)
    .eq("direction", "in").is("media_url", null).order("timestamp", { ascending: false }).limit(1).maybeSingle();
  if (!msg) return;
  await admin.from("messages").update({
    media_url: path, media_type: kind, media_mime: mime,
    media_name: String(node?.fileName ?? got.name ?? "").slice(0, 120) || null,
  }).eq("id", msg.id);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Motivos de cierre que exigen volver a vincular el número (WhatsApp cerró la sesión o la abrieron en otro lado)
const RELINK_REASONS = new Set([401, 403, 440]);

// Estado de la conexión del número. Solo avisa cuando pasa de "conectado" a "sesión cerrada" (no en cada reintento).
async function onConnectionUpdate(ch: { id: string; organization_id: string; name: string; status: string }, d: any) {
  const state = String(d?.state ?? "").toLowerCase();
  const reason = Number(d?.statusReason ?? d?.statusCode ?? 0);

  if (state === "open") {
    await admin.from("channels").update({ status: "connected", needs_reconnect: false, disconnected_at: null }).eq("id", ch.id);
    return json({ ok: true, state });
  }
  if (state !== "close") return json({ ok: true, ignored: state });

  const relink = RELINK_REASONS.has(reason);
  if (ch.status === "connected" && relink) {
    await admin.from("channels").update({ status: "disconnected", needs_reconnect: true, disconnected_at: new Date().toISOString() }).eq("id", ch.id);
    await alertAdmins(ch);
  } // un cierre transitorio no cambia nada: WhatsApp se reconecta solo y, si no, lo corrige la sincronización de Conexiones
  return json({ ok: true, state, relink });
}

// WhatsApp a los administradores (su "WhatsApp personal"), enviado desde otro número de la empresa que siga conectado
async function alertAdmins(ch: { id: string; organization_id: string; name: string }) {
  try {
    const { data: admins } = await admin.from("profiles").select("whatsapp").eq("organization_id", ch.organization_id).eq("role", "admin").not("whatsapp", "is", null);
    const { data: via } = await admin.from("channels").select("api_url, api_key, instance_name")
      .eq("organization_id", ch.organization_id).eq("status", "connected").neq("id", ch.id).not("instance_name", "is", null).limit(1).maybeSingle();
    if (!via || !admins?.length) return;
    const text = `⚠️ Tu número "${ch.name}" se desconectó de WhatsApp. Entra al CRM → Conexiones y vuelve a vincularlo con el código QR para seguir recibiendo mensajes.`;
    await Promise.allSettled(admins.map((a) => sendText(via, String(a.whatsapp), text)));
  } catch (e) {
    console.error("alerta", String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channel");
  const secret = url.searchParams.get("secret");
  if (!channelId || !secret) return json({ error: "unauthorized" }, 401);

  const { data: channel } = await admin
    .from("channels").select("id, webhook_secret, organization_id, name, status").eq("id", channelId).maybeSingle();
  if (!channel || channel.webhook_secret !== secret) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const event = String(body?.event ?? "").toLowerCase().replace(/_/g, ".");
  if (event === "connection.update") return await onConnectionUpdate(channel, body?.data);
  if (event !== "messages.upsert") return json({ ok: true, ignored: event });

  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!data || data.key?.fromMe) return json({ ok: true, ignored: "own" });

  const jid: string = data.key?.remoteJid ?? "";
  if (!jid.endsWith("@s.whatsapp.net")) return json({ ok: true, ignored: "not-direct" });

  const m = data.message ?? {};
  const content: string | null =
    m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? m.documentMessage?.caption ?? null;
  const mediaNode = m.imageMessage ?? m.audioMessage ?? m.videoMessage ?? m.documentMessage ?? m.stickerMessage ?? null;
  const kind: MediaType | null = m.imageMessage ? "image" : m.audioMessage ? "audio" : m.videoMessage ? "video"
    : m.documentMessage ? "document" : m.stickerMessage ? "sticker" : null;
  if (!content && !kind) return json({ ok: true, ignored: "empty" });

  const { data: conversationId, error } = await admin.rpc("ingest_message", {
    p_channel_id: channel.id,
    p_phone: jid.split("@")[0],
    p_name: data.pushName ?? null,
    p_content: content,
    p_media_url: null,
  });
  if (error) return json({ error: error.message }, 500);
  if (!conversationId) return json({ ok: true, ignored: "contact-limit-or-suspended" }); // empresa suspendida o sin cupo de contactos

  // whalink: el mensaje trae "(ref:código)" -> cuenta como lead del enlace
  const text = content ?? "";
  const ref = /\(ref:([a-f0-9]{6})\)/i.exec(text);
  if (ref) await admin.rpc("whalink_attribute", { p_conversation: conversationId, p_code: ref[1] });
  // baja: quien escribe STOP no recibirá envíos masivos
  if (/^\s*(stop|baja|cancelar|no molestar)\s*$/i.test(text)) {
    await admin.rpc("mark_do_not_contact", { p_conversation: conversationId });
  }

  // dispara las automatizaciones sin bloquear la respuesta al proveedor
  const mediaJob = kind
    ? saveMedia(conversationId as string, channel.id, data.key.id, kind, { ...mediaNode, base64: data.message?.base64 ?? mediaNode?.base64 })
        .catch((e) => console.error("media", String(e)))
    : Promise.resolve();
  const bg = Promise.allSettled([tick(admin, 10), aiRespond(admin, conversationId as string), mediaJob]);
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(bg); else await bg;
  return json({ ok: true });
});
