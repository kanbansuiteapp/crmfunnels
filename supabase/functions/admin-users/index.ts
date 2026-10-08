// Alta de agentes por un administrador: { email, password, name }
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

  const { data: me } = await admin
    .from("profiles").select("organization_id, role").eq("id", u.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Solo administradores" }, 403);

  const { email, password, name, show_name, chat_visibility } = await req.json().catch(() => ({}));
  const vis = ["assigned", "unassigned", "all"].includes(chat_visibility) ? chat_visibility : "assigned";
  if (!/^\S+@\S+\.\S+$/.test(String(email ?? ""))) return json({ error: "Correo inválido" }, 400);
  if (String(password ?? "").length < 8) return json({ error: "La contraseña necesita 8+ caracteres" }, 400);

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !created.user) return json({ error: error?.message ?? "No se pudo crear" }, 400);

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id,
    organization_id: me.organization_id,
    name: String(name ?? "").trim() || String(email).split("@")[0],
    email,
    role: "agent",
    show_name: show_name === true,
    chat_visibility: vis,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id); // no dejar usuarios huérfanos
    return json({ error: pErr.message }, 500);
  }
  return json({ ok: true, id: created.user.id });
});
