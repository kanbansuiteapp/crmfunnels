import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: org }] = await Promise.all([
    supabase.from("profiles").select("name, whatsapp, timezone, role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("organizations").select("timezone").maybeSingle(),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Configuración de perfil</h1>
      <p className="mb-6 text-sm text-slate-500">Actualiza tus datos personales y configuraciones de tu cuenta.</p>
      <ProfileForm
        email={auth.user?.email ?? ""}
        role={me.role}
        initial={{ name: me.name, whatsapp: me.whatsapp ?? "", timezone: me.timezone ?? org?.timezone ?? "America/Lima" }}
      />
    </main>
  );
}
