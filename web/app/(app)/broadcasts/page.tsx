import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BroadcastsClient, type Broadcast } from "@/components/broadcasts/BroadcastsClient";

export default async function BroadcastsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: items }, { data: channels }, { data: tags }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("broadcasts")
      .select("id, name, message, status, per_minute, total, sent, failed, created_at, channel:channels(name), tag:tags(name)")
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("channels").select("id, name").order("created_at"),
    supabase.from("tags").select("id, name").order("name"),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Envío masivo</h1>
      <p className="mb-6 text-sm text-slate-500">
        Envía un mensaje a todos tus contactos o a los de una etiqueta, con límite de velocidad por minuto.
      </p>
      <BroadcastsClient
        items={(items ?? []) as unknown as Broadcast[]}
        channels={channels ?? []}
        tags={tags ?? []}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
