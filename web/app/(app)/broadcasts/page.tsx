import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BroadcastsClient, type Broadcast } from "@/components/broadcasts/BroadcastsClient";

export default async function BroadcastsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: items }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("broadcasts")
      .select("id, name, message, status, per_minute, total, sent, failed, created_at, started_at, scheduled_at, channel:channels(name), tag:tags(name)")
      .order("created_at", { ascending: false }).limit(30),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-6xl p-6">
      <BroadcastsClient
        items={(items ?? []) as unknown as Broadcast[]}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
