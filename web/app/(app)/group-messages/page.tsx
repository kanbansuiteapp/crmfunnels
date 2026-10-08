import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle();
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Mensajes</h1>
      <p className="mb-6 text-sm text-slate-500">Envía y programa mensajes para tus grupos y comunidades.</p>
      <p className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">Aún no hay mensajes.</p>
    </main>
  );
}
