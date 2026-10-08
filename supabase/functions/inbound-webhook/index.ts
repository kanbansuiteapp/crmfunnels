// Webhook de entrada genérico (Hotmart, Stripe vía puente, etc.): POST /inbound-webhook?hook=<id>
// Autenticación: firma HMAC-SHA256 hex del cuerpo en `x-signature`, o el secreto en `x-hotmart-hottok`.
// Cuerpo JSON esperado: { event, phone, name?, ...datos }
import { createClient } from "npm:@supabase/supabase-js@2";
import { tick } from "../_shared/engine.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const hookId = new URL(req.url).searchParams.get("hook");
  if (!hookId) return json({ error: "unauthorized" }, 401);

  const { data: hook } = await admin.from("webhooks").select("id, organization_id, secret, direction")
    .eq("id", hookId).eq("direction", "in").maybeSingle();
  if (!hook?.secret) return json({ error: "unauthorized" }, 401);

  const raw = await req.text();
  const sig = (req.headers.get("x-signature") ?? "").toLowerCase();
  const tok = req.headers.get("x-hotmart-hottok") ?? "";
  const okSig = sig && safeEqual(sig, await hmacHex(hook.secret, raw));
  const okTok = tok && safeEqual(tok, hook.secret);
  if (!okSig && !okTok) return json({ error: "unauthorized" }, 401);

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "JSON inválido" }, 400); }
  const digits = String(body?.phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return json({ error: "phone inválido" }, 400);

  const { data: contact, error } = await admin.from("contacts").upsert(
    { organization_id: hook.organization_id, phone_number: "+" + digits, name: body?.name ?? null },
    { onConflict: "organization_id,phone_number", ignoreDuplicates: true },
  ).select("id").maybeSingle();

  let contactId = contact?.id;
  if (!contactId && !error) {
    const { data: existing } = await admin.from("contacts").select("id")
      .eq("organization_id", hook.organization_id).eq("phone_number", "+" + digits).single();
    contactId = existing?.id;
  }
  if (!contactId) return json({ error: error?.message ?? "contacto" }, 500);

  await admin.from("contact_events").insert({
    organization_id: hook.organization_id, contact_id: contactId, type: "webhook",
    payload: { hook_id: hook.id, event: body?.event ?? null },
  });
  await admin.from("automation_events").insert({
    organization_id: hook.organization_id, type: "webhook", contact_id: contactId,
    payload: { hook_id: hook.id, event: body?.event ?? null, data: body },
  });

  // procesar sin bloquear la respuesta
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase
  const bg = tick(admin, 10).catch((e) => console.error(e));
  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(bg); else await bg;
  return json({ ok: true });
});
