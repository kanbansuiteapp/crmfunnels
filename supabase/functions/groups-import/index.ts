// Importación de grupos y comunidades de un número (Evolution API), solo administradores.
//   { action: "list",   channel_id, type: "group" | "community" | "channel" } → grupos disponibles del número
//   { action: "import", channel_id, items: [{ jid, type }] }                  → los guarda en wa_groups
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Raw = {
  id: string; subject?: string; size?: number; creation?: number; pictureUrl?: string | null;
  participants?: { id: string; admin?: string | null }[]; isCommunity?: boolean; isCommunityAnnounce?: boolean;
};
type Creds = { api_url: string | null; api_key: string | null; instance_name: string | null };

async function evo(ch: Creds, path: string): Promise<unknown> {
  if (!ch.api_url || !ch.api_key || !ch.instance_name) throw new Error("el número no tiene credenciales");
  const r = await fetch(`${ch.api_url.replace(/\/$/, "")}${path.replace("{i}", ch.instance_name)}`, {
    headers: { apikey: ch.api_key }, signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}. Revisa que el número esté conectado.`);
  return r.json();
}

const kindOf = (g: Raw): "group" | "community" => (g.isCommunity ? "community" : "group");

async function fetchGroups(ch: Creds): Promise<Raw[]> {
  const all = (await evo(ch, "/group/fetchAllGroups/{i}?getParticipants=true")) as Raw[];
  // los grupos de avisos de una comunidad no se listan por separado
  return (Array.isArray(all) ? all : []).filter((g) => g?.id && !g.isCommunityAnnounce);
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

  const body = await req.json().catch(() => ({}));
  const { data: ch } = await admin.from("channels").select("id, organization_id, api_url, api_key, instance_name")
    .eq("id", String(body.channel_id ?? "")).eq("organization_id", me.organization_id).maybeSingle();
  if (!ch) return json({ error: "número no encontrado" }, 404);

  try {
    if (body.action === "list") {
      if (body.type === "channel") return json({ items: [], note: "La importación de canales aún no está disponible." });
      const want = body.type === "community" ? "community" : "group";
      const { data: have } = await admin.from("wa_groups").select("jid").eq("channel_id", ch.id);
      const imported = new Set((have ?? []).map((h) => h.jid));
      const items = (await fetchGroups(ch)).filter((g) => kindOf(g) === want).map((g) => ({
        jid: g.id, name: g.subject ?? g.id, participants: g.size ?? g.participants?.length ?? 0, imported: imported.has(g.id),
      }));
      return json({ items });
    }

    if (body.action === "import") {
      const jids = new Set((Array.isArray(body.items) ? body.items : []).map((i: { jid: string }) => String(i.jid)));
      if (jids.size === 0) return json({ error: "Selecciona al menos un grupo" }, 400);
      const groups = (await fetchGroups(ch)).filter((g) => jids.has(g.id));
      const rows = [];
      for (const g of groups) {
        let invite: string | null = null;
        try {
          const r = (await evo(ch, `/group/inviteCode/{i}?groupJid=${encodeURIComponent(g.id)}`)) as { code?: string; inviteUrl?: string };
          invite = r.inviteUrl ?? (r.code ? `https://chat.whatsapp.com/${r.code}` : null);
        } catch { /* sin permiso de administrador: se importa sin enlace */ }
        const parts = g.participants ?? [];
        rows.push({
          organization_id: ch.organization_id, channel_id: ch.id, jid: g.id, name: g.subject ?? g.id, origin: "import",
          type: kindOf(g), admins: parts.filter((p) => p.admin).length, participants: g.size ?? parts.length,
          invite_link: invite, avatar_url: g.pictureUrl ?? null,
          created_at: g.creation ? new Date(g.creation * 1000).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      if (rows.length === 0) return json({ error: "No se encontraron los grupos seleccionados" }, 404);
      const { error } = await admin.from("wa_groups").upsert(rows, { onConflict: "channel_id,jid" });
      if (error) return json({ error: error.message }, 500);
      return json({ imported: rows.length });
    }
    return json({ error: "acción inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
