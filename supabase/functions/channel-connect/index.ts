// Conexión de números de WhatsApp (Evolution API): crear dispositivo, QR, estado, renombrar, desconectar y eliminar.
// Solo administradores. Requiere los secretos EVOLUTION_API_URL y EVOLUTION_API_KEY (llave global del servidor Evolution).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await user.auth.getUser();
  if (!u.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await admin.from("profiles").select("role, organization_id").eq("id", u.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Solo administradores" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // ── alta de un dispositivo vacío ("Sin uso"); no toca Evolution
  if (action === "create") {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (!name) return json({ error: "El nombre es obligatorio" }, 400);
    const { data: org } = await admin.from("organizations").select("max_devices").eq("id", me.organization_id).single();
    const { count } = await admin.from("channels").select("id", { count: "exact", head: true }).eq("organization_id", me.organization_id);
    if (org?.max_devices != null && (count ?? 0) >= org.max_devices) return json({ error: "Alcanzaste el límite de dispositivos de tu plan" }, 403);
    const { data: ch, error } = await admin.from("channels")
      .insert({ organization_id: me.organization_id, name, provider: "evolution", status: "disconnected" }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: ch.id });
  }

  const { data: ch } = await admin.from("channels")
    .select("id, name, status, phone_number, api_url, api_key, instance_name, webhook_secret")
    .eq("id", String(body.channel_id ?? "")).eq("organization_id", me.organization_id).maybeSingle();
  if (!ch) return json({ error: "Dispositivo no encontrado" }, 404);

  if (action === "rename") {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (!name) return json({ error: "El nombre es obligatorio" }, 400);
    await admin.from("channels").update({ name }).eq("id", ch.id);
    return json({ ok: true });
  }

  const evoUrl = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
  const evoKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";
  const evo = async (method: string, path: string, key: string, payload?: unknown) => {
    const r = await fetch(`${evoUrl}${path}`, {
      method, headers: { "Content-Type": "application/json", apikey: key },
      body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* respuesta no JSON */ }
    return { ok: r.ok, status: r.status, data };
  };

  try {
    // eliminar un dispositivo que nunca se conectó no necesita Evolution
    if (action === "remove" && !ch.instance_name) {
      await admin.from("channels").delete().eq("id", ch.id);
      return json({ ok: true });
    }
    if (!evoUrl || !evoKey) return json({ error: "Falta configurar la conexión con Evolution API (secretos EVOLUTION_API_URL y EVOLUTION_API_KEY)." }, 503);

    if (action === "qr") {
      // Messenger (WhatsApp normal) o Business (app WhatsApp Business): ambos se vinculan por QR; cambia lo que el número puede hacer
      const waType = body.wa_type === "business" ? "business" : "messenger";
      await admin.from("channels").update({ wa_type: waType }).eq("id", ch.id);
      let instance = ch.instance_name as string | null;
      let token = ch.api_key as string | null;
      let qr: string | null = null;
      if (!instance || !token) {
        instance = `crm-${ch.id.slice(0, 8)}`;
        token = crypto.randomUUID().replaceAll("-", "").toUpperCase();
        const made = await evo("POST", "/instance/create", evoKey, {
          instanceName: instance, token, qrcode: true, integration: "WHATSAPP-BAILEYS",
          webhook: { url: `${url}/functions/v1/wa-webhook?channel=${ch.id}&secret=${ch.webhook_secret}`, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
        });
        if (!made.ok && made.status !== 403) return json({ error: `Evolution respondió ${made.status} al crear la instancia` }, 502);
        await admin.from("channels").update({ api_url: evoUrl, api_key: token, instance_name: instance }).eq("id", ch.id);
        qr = made.data?.qrcode?.base64 ?? null;
      }
      if (!qr) {
        const c = await evo("GET", `/instance/connect/${instance}`, token!);
        if (!c.ok) return json({ error: `Evolution respondió ${c.status} al pedir el QR` }, 502);
        qr = c.data?.base64 ?? null;
      }
      return json({ ok: true, qr });
    }

    if (action === "status") {
      if (!ch.instance_name) return json({ ok: true, status: "disconnected", phone: null });
      let s = await evo("GET", `/instance/connectionState/${ch.instance_name}`, ch.api_key ?? evoKey);
      if (!s.ok) s = await evo("GET", `/instance/connectionState/${ch.instance_name}`, evoKey); // la llave guardada pudo cambiar
      if (!s.ok) return json({ error: `Evolution respondió ${s.status} al consultar el estado` }, 502);
      const state = s.data?.instance?.state ?? s.data?.state;
      if (state === "open") {
        let phone = ch.phone_number as string | null;
        const f = await evo("GET", `/instance/fetchInstances?instanceName=${ch.instance_name}`, evoKey);
        const info = Array.isArray(f.data) ? f.data[0] : f.data;
        const owner = String(info?.ownerJid ?? info?.instance?.owner ?? info?.number ?? "");
        const digits = owner.split("@")[0].replace(/\D/g, "");
        if (digits) phone = `+${digits}`;
        await admin.from("channels").update({ status: "connected", phone_number: phone }).eq("id", ch.id);
        return json({ ok: true, status: "connected", phone });
      }
      await admin.from("channels").update({ status: "disconnected" }).eq("id", ch.id);
      return json({ ok: true, status: "disconnected", phone: ch.phone_number });
    }

    if (action === "logout") {
      if (ch.instance_name) await evo("DELETE", `/instance/logout/${ch.instance_name}`, ch.api_key!);
      await admin.from("channels").update({ status: "disconnected" }).eq("id", ch.id);
      return json({ ok: true });
    }

    if (action === "remove") {
      await evo("DELETE", `/instance/delete/${ch.instance_name}`, evoKey);
      await admin.from("channels").delete().eq("id", ch.id);
      return json({ ok: true });
    }
    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
