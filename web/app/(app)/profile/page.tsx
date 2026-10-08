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
    <main className="w-full p-6 md:px-10 md:py-8">
      <h1 className="text-3xl font-semibold text-slate-900">Configuración de perfil</h1>
      <p className="mb-8 mt-2 text-sm text-slate-500">Actualiza tus datos personales y configuraciones de tu cuenta.</p>
      <ProfileForm
        email={auth.user?.email ?? ""}
        role={me.role}
        initial={{ name: me.name, whatsapp: me.whatsapp ?? "", timezone: me.timezone ?? org?.timezone ?? "America/Lima" }}
      />
    </main>
  );
}
