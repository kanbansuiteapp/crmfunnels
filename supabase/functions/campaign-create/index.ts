// Crea en WhatsApp el primer grupo de una campaña con creación automática (Evolution API), solo administradores.
//   { campaign_id } → crea el grupo con el número creador, promueve a los administradores y lo vincula a la campaña
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Creds = { api_url: string | null; api_key: string | null; instance_name: string | null };

async function evo(ch: Creds, method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  if (!ch.api_url || !ch.api_key || !ch.instance_name) throw new Error("el número creador no tiene credenciales");
  const r = await fetch(`${ch.api_url.replace(/\/$/, "")}${path.replace("{i}", ch.instance_name)}`, {
    method, headers: { apikey: ch.api_key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${String((data as { response?: { message?: unknown } }).response?.message ?? (data as { message?: unknown }).message ?? "error")}`);
  return data as Record<string, unknown>;
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
  const { data: me } = await admin.from("profiles").select("role, organization_id").eq("id", u.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Solo administradores" }, 403);

  const { campaign_id } = await req.json().catch(() => ({}));
  const { data: c } = await admin.from("group_campaigns").select("*")
    .eq("id", String(campaign_id ?? "")).eq("organization_id", me.organization_id).maybeSingle();
  if (!c) return json({ error: "campaña no encontrada" }, 404);
  if (c.type !== "group" || !c.auto_create) return json({ error: "Esta campaña no tiene creación automática de grupos" }, 400);

  const { count } = await admin.from("group_campaign_groups").select("group_id", { count: "exact", head: true }).eq("campaign_id", c.id);
  if ((count ?? 0) > 0) return json({ created: 0 });

  try {
    const { data: chans } = await admin.from("channels").select("id, phone_number, api_url, api_key, instance_name")
      .in("id", c.admin_channel_ids).eq("organization_id", me.organization_id);
    const creator = (chans ?? []).find((x) => x.id === c.admin_channel_ids[0]);
    if (!creator) throw new Error("No se encontró el número creador");
    const digits = (s: string | null) => String(s ?? "").replace(/\D/g, "");
    const others = [...new Set([...(chans ?? []).filter((x) => x.id !== creator.id).map((x) => digits(x.phone_number)), ...c.backup_admins.map(digits)])]
      .filter((n) => n && n !== digits(creator.phone_number));

    const n = c.numbering_start;
    const subject = (c.numbering_position === "start" ? `#${n} ${c.name}` : `${c.name} #${n}`).slice(0, 100);
    const made = await evo(creator, "POST", "/group/create/{i}", { subject, description: c.description, participants: others });
    const jid = String(made.id ?? made.groupJid ?? "");
    if (!jid) throw new Error("WhatsApp no devolvió el identificador del grupo");
    const q = `?groupJid=${encodeURIComponent(jid)}`;

    // los pasos siguientes mejoran el grupo; si alguno falla, el grupo ya existe y se vincula igual
    const warnings: string[] = [];
    const step = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { warnings.push(`${label}: ${e instanceof Error ? e.message : e}`); } };
    if (others.length) await step("administradores", () => evo(creator, "POST", `/group/updateParticipant/{i}${q}`, { action: "promote", participants: others }));
    await step("quién envía", () => evo(creator, "POST", `/group/updateSetting/{i}${q}`, { action: c.who_can_send === "admins" ? "announcement" : "not_announcement" }));
    if (c.image_path && String(c.image_path).startsWith(`${me.organization_id}/campaigns/`)) {
      await step("imagen", async () => {
        const signed = await admin.storage.from("chat-media").createSignedUrl(String(c.image_path), 600);
        if (!signed.data?.signedUrl) throw new Error("no se pudo leer la imagen");
        await evo(creator, "POST", `/group/updateGroupPicture/{i}${q}`, { image: signed.data.signedUrl });
      });
    }
    let invite: string | null = null;
    await step("enlace", async () => {
      const r = await evo(creator, "GET", `/group/inviteCode/{i}${q}`);
      invite = (r.inviteUrl as string) ?? (r.code ? `https://chat.whatsapp.com/${r.code}` : null);
    });

    const { data: row, error } = await admin.from("wa_groups").upsert({
      organization_id: me.organization_id, channel_id: creator.id, jid, name: subject, origin: "created", type: "group",
      admins: others.length + 1, participants: others.length + 1, capacity: c.max_participants, invite_link: invite,
      updated_at: new Date().toISOString(), last_synced_at: new Date().toISOString(),
    }, { onConflict: "channel_id,jid" }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "no se pudo guardar el grupo");
    await admin.from("group_campaign_groups").upsert({ campaign_id: c.id, group_id: row.id, organization_id: me.organization_id, position: 0 });
    return json({ created: 1, warnings });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
