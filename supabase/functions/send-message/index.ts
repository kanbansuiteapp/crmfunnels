// Envío manual desde el panel: { conversation_id, content } con el JWT del usuario
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

  const { conversation_id, content } = await req.json().catch(() => ({}));
  if (!conversation_id || !String(content ?? "").trim()) return json({ error: "datos inválidos" }, 400);

  const { data: conv } = await user
    .from("conversations")
    .select("id, organization_id, channel_id, contact_id, contact:contacts(phone_number)")
    .eq("id", conversation_id).maybeSingle();
  if (!conv) return json({ error: "conversación no encontrada" }, 404);

  const { data: ch } = await admin
    .from("channels").select("api_url, api_key, instance_name").eq("id", conv.channel_id).single();

  let status = "sent";
  let detail: string | null = null;
  if (ch?.api_url && ch.api_key && ch.instance_name) {
    try {
      const phone = String((conv.contact as { phone_number: string } | null)?.phone_number ?? "").replace(/\D/g, "");
      const r = await fetch(`${ch.api_url.replace(/\/$/, "")}/message/sendText/${ch.instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ch.api_key },
        body: JSON.stringify({ number: phone, text: String(content) }),
      });
      if (!r.ok) { status = "failed"; detail = `proveedor respondió ${r.status}`; }
    } catch (e) {
      status = "failed"; detail = String(e);
    }
  } else {
    status = "failed"; detail = "canal sin credenciales";
  }

  // el mensaje se guarda siempre, con su estado
  const { error } = await admin.from("messages").insert({
    organization_id: conv.organization_id, conversation_id: conv.id, contact_id: conv.contact_id,
    sender_id: u.user.id, direction: "out", content: String(content), status,
  });
  if (error) return json({ error: error.message }, 500);
  await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
  return json({ ok: status === "sent", status, detail });
});
