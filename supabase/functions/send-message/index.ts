// Envío manual desde el panel: { conversation_id, content?, media?: { path, name, mime } } con el JWT del usuario
import { createClient } from "npm:@supabase/supabase-js@2";
import { mediaTypeOf, sendMedia, sendText, toBase64 } from "../_shared/provider.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_BYTES = 16 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  // con el JWT del usuario: RLS decide si puede ver la conversación
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await user.auth.getUser();
  if (!u.user) return json({ error: "unauthorized" }, 401);

  const { conversation_id, content, media } = await req.json().catch(() => ({}));
  const text = String(content ?? "").trim();
  if (!conversation_id || (!text && !media?.path)) return json({ error: "datos inválidos" }, 400);

  const { data: conv } = await user
    .from("conversations")
    .select("id, organization_id, channel_id, contact_id, contact:contacts(phone_number)")
    .eq("id", conversation_id).maybeSingle();
  if (!conv) return json({ error: "conversación no encontrada" }, 404);

  // el archivo debe estar en la carpeta de esta organización y esta conversación
  if (media && !String(media.path).startsWith(`${conv.organization_id}/${conv.id}/`)) {
    return json({ error: "archivo no válido" }, 400);
  }

  const { data: ch } = await admin
    .from("channels").select("api_url, api_key, instance_name").eq("id", conv.channel_id).single();
  const phone = String((conv.contact as { phone_number: string } | null)?.phone_number ?? "");

  let status = "sent";
  let detail: string | null = null;
  let mime: string | null = null;
  let type: ReturnType<typeof mediaTypeOf> | null = null;
  try {
    if (!ch) throw new Error("canal no encontrado");
    if (media) {
      const dl = await admin.storage.from("chat-media").download(String(media.path));
      if (dl.error || !dl.data) throw new Error("no se encontró el archivo subido");
      if (dl.data.size > MAX_BYTES) throw new Error("archivo demasiado grande");
      mime = (dl.data.type || String(media.mime ?? "application/octet-stream")).split(";")[0];
      type = mediaTypeOf(mime);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      await sendMedia(ch, phone, {
        type, mime, name: String(media.name ?? "archivo").slice(0, 120), base64: toBase64(bytes), caption: text,
      });
    } else {
      await sendText(ch, phone, text);
    }
  } catch (e) {
    status = "failed";
    detail = String(e instanceof Error ? e.message : e);
  }

  // el mensaje se guarda siempre, con su estado
  const { error } = await admin.from("messages").insert({
    organization_id: conv.organization_id, conversation_id: conv.id, contact_id: conv.contact_id,
    sender_id: u.user.id, direction: "out", content: text || null, status,
    ...(media ? { media_url: String(media.path), media_type: type, media_mime: mime, media_name: String(media.name ?? "").slice(0, 120) || null } : {}),
  });
  if (error) return json({ error: error.message }, 500);
  // si una persona escribe, la IA deja de responder en este chat (se puede reactivar desde la bandeja)
  await admin.from("conversations")
    .update({ last_message_at: new Date().toISOString(), ai_enabled: false }).eq("id", conv.id);
  return json({ ok: status === "sent", status, detail });
});
