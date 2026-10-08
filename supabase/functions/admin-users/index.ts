// Vendedores de una empresa (solo el administrador de la empresa). Los vendedores entran con número de WhatsApp y contraseña.
//   crear:      { name, phone, password, show_name, chat_visibility }
//   contraseña: { action: "set_password", user_id, password }
//   eliminar:   { action: "delete", user_id }
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// El número se convierte en un correo interno para Supabase Auth (el vendedor nunca lo ve). Debe coincidir con la pantalla de login.
const SELLER_DOMAIN = "vendedor.crm";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await user.auth.getUser();
  if (!u.user) return json({ error: "unauthorized" }, 401);

  const { data: me } = await admin
    .from("profiles").select("organization_id, role").eq("id", u.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Solo administradores" }, 403);
  const { data: org } = await admin.from("organizations").select("active, max_agents").eq("id", me.organization_id).single();
  if (!org?.active) return json({ error: "La empresa está suspendida" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "create");

  if (action === "set_password" || action === "delete") {
    const { data: target } = await admin.from("profiles").select("id, role")
      .eq("id", String(body.user_id ?? "")).eq("organization_id", me.organization_id).maybeSingle();
    if (!target || target.role !== "agent") return json({ error: "Vendedor no encontrado" }, 404);
    if (action === "set_password") {
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "La contraseña necesita 8+ caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(target.id, { password });
      return error ? json({ error: error.message }, 500) : json({ ok: true });
    }
    // sus chats y deals quedan sin asignar (on delete set null) y el perfil se borra en cascada
    const { error } = await admin.auth.admin.deleteUser(target.id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (action !== "create") return json({ error: "Acción no válida" }, 400);
  const digits = String(body.phone ?? "").replace(/\D/g, "");
  const password = String(body.password ?? "");
  if (digits.length < 8 || digits.length > 15) return json({ error: "Número de WhatsApp inválido (con código de país)" }, 400);
  if (password.length < 8) return json({ error: "La contraseña necesita 8+ caracteres" }, 400);

  if (org.max_agents != null) {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("organization_id", me.organization_id).eq("role", "agent");
    if ((count ?? 0) >= org.max_agents) return json({ error: `Alcanzaste el límite de ${org.max_agents} vendedores de tu plan` }, 403);
  }

  const vis = ["assigned", "unassigned", "all"].includes(body.chat_visibility) ? body.chat_visibility : "assigned";
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${digits}@${SELLER_DOMAIN}`, password, email_confirm: true,
  });
  if (error || !created.user) {
    return json({ error: /already|registered/i.test(error?.message ?? "") ? "Ese número ya está registrado" : (error?.message ?? "No se pudo crear") }, 400);
  }

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id,
    organization_id: me.organization_id,
    name: String(body.name ?? "").trim() || `+${digits}`,
    email: null,
    phone: `+${digits}`,
    role: "agent",
    show_name: body.show_name === true,
    chat_visibility: vis,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id); // no dejar usuarios huérfanos
    return json({ error: pErr.message }, 500);
  }
  return json({ ok: true, id: created.user.id });
});
