// Panel de la plataforma: crear empresas con límites, editarlas, suspenderlas y restablecer la contraseña del titular.
// Solo dueños de la plataforma (tabla platform_admins).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// límite: entero >= 0, o null = sin límite
const limit = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000_000 ? n : undefined;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: u } = await user.auth.getUser();
  if (!u.user) return json({ error: "unauthorized" }, 401);
  const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
  if (!pa) return json({ error: "Solo el dueño de la plataforma" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  try {
    if (action === "list") {
      const { data: orgs, error } = await admin.from("organizations")
        .select("id, name, plan_name, max_agents, max_devices, max_contacts, contact_limit_hits, active, created_at").order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      const out = await Promise.all((orgs ?? []).map(async (o: any) => {
        const count = async (table: string, extra?: (q: any) => any) => {
          let q = admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", o.id);
          if (extra) q = extra(q);
          return (await q).count ?? 0;
        };
        const [agents, devices, contacts, owner] = await Promise.all([
          count("profiles", (q) => q.eq("role", "agent")), count("channels"), count("contacts"),
          admin.from("profiles").select("name, email").eq("organization_id", o.id).eq("role", "admin").order("created_at").limit(1).maybeSingle(),
        ]);
        return { ...o, agents, devices, contacts, owner_name: owner.data?.name ?? "", owner_email: owner.data?.email ?? "" };
      }));
      return json({ ok: true, companies: out });
    }

    if (action === "create_company") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      const email = String(body.owner_email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const ownerName = String(body.owner_name ?? "").trim().slice(0, 80);
      if (!name) return json({ error: "El nombre de la empresa es obligatorio" }, 400);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Correo del titular inválido" }, 400);
      if (password.length < 8) return json({ error: "La contraseña necesita 8+ caracteres" }, 400);
      for (const k of ["max_agents", "max_devices", "max_contacts"]) {
        if (body[k] !== undefined && limit(body[k]) === undefined) return json({ error: "Los límites deben ser números enteros (o vacío = sin límite)" }, 400);
      }
      const lim = { max_agents: limit(body.max_agents), max_devices: limit(body.max_devices), max_contacts: limit(body.max_contacts) };

      const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr || !created.user) return json({ error: /already|registered/i.test(cErr?.message ?? "") ? "Ese correo ya está registrado" : (cErr?.message ?? "No se pudo crear el usuario") }, 400);
      const uid = created.user.id;

      const undo = async () => { await admin.auth.admin.deleteUser(uid); };
      const { data: org, error: oErr } = await admin.from("organizations").insert({
        name, plan_name: String(body.plan_name ?? "").trim().slice(0, 60) || "Plan",
        max_agents: lim.max_agents ?? null, max_devices: lim.max_devices ?? null, max_contacts: lim.max_contacts ?? null,
      }).select("id").single();
      if (oErr || !org) { await undo(); return json({ error: oErr?.message ?? "No se pudo crear la empresa" }, 500); }

      const { error: pErr } = await admin.from("profiles").insert({
        id: uid, organization_id: org.id, name: ownerName || email.split("@")[0], email, role: "admin",
      });
      if (pErr) { await admin.from("organizations").delete().eq("id", org.id); await undo(); return json({ error: pErr.message }, 500); }

      const { error: sErr } = await admin.rpc("seed_organization", { p_org: org.id });
      if (sErr) { await admin.from("organizations").delete().eq("id", org.id); await undo(); return json({ error: sErr.message }, 500); }
      return json({ ok: true, id: org.id });
    }

    if (action === "update_company") {
      const id = String(body.org_id ?? "");
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 80); if (!n) return json({ error: "El nombre no puede estar vacío" }, 400); patch.name = n; }
      if (body.plan_name !== undefined) patch.plan_name = String(body.plan_name).trim().slice(0, 60) || "Plan";
      for (const k of ["max_agents", "max_devices", "max_contacts"]) {
        if (body[k] === undefined) continue;
        const v = limit(body[k]);
        if (v === undefined) return json({ error: "Los límites deben ser números enteros (o vacío = sin límite)" }, 400);
        patch[k] = v;
      }
      if (patch.max_contacts !== undefined) patch.contact_limit_hits = 0; // al cambiar el límite se reinicia el aviso
      if (body.active !== undefined) patch.active = body.active === true;
      if (Object.keys(patch).length === 0) return json({ error: "Nada que cambiar" }, 400);
      const { error } = await admin.from("organizations").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "reset_owner_password") {
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "La contraseña necesita 8+ caracteres" }, 400);
      const { data: owner } = await admin.from("profiles").select("id").eq("organization_id", String(body.org_id ?? "")).eq("role", "admin").order("created_at").limit(1).maybeSingle();
      if (!owner) return json({ error: "La empresa no tiene titular" }, 404);
      const { error } = await admin.auth.admin.updateUserById(owner.id, { password });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
