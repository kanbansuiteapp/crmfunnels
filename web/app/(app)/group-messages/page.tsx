import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Bandeja de mensajes de grupos, comunidades y canales (no incluye los chats 1 a 1)
export default async function GroupMessagesPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle();
  if (!me) redirect("/");

  return (
    <main className="flex h-full min-h-[calc(100vh-3.5rem)]">
      <section className="flex w-full max-w-sm shrink-0 flex-col border-r border-slate-200 bg-white" aria-label="Conversaciones de grupos">
        <div className="p-5">
          <h1 className="mb-4 text-2xl font-bold text-slate-900">Mensajes</h1>
          <input type="search" aria-label="Buscar" placeholder="Buscar grupo, comunidad o canal" className="w-full rounded-full border border-slate-300 px-5 py-3 text-base" />
        </div>
        <p className="px-6 py-10 text-center text-base text-slate-600">Aún no hay mensajes de grupos, comunidades ni canales.</p>
      </section>
      <section className="hidden flex-1 items-center justify-center bg-slate-50 text-base text-slate-500 md:flex">
        Selecciona una conversación
      </section>
    </main>
  );
}
