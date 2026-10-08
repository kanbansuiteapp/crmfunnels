// Invocado por pg_cron cada minuto con el secreto de Vault en x-cron-secret
import { createClient } from "npm:@supabase/supabase-js@2";
import { runBroadcasts, tick } from "../_shared/engine.ts";

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !safeEqual(secret, given)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // el envío masivo puede durar hasta un minuto: se responde de inmediato y se trabaja en segundo plano
  const work = Promise.allSettled([tick(admin, 50), runBroadcasts(admin)]);
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); else await work;
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
