import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: tags }, { data: channels }, { data: pipeline }] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("channels").select("id, name").order("created_at"),
    supabase.from("pipelines").select("id").order("created_at").limit(1).maybeSingle(),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-6xl p-4">
      <nav className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link href="/inbox" className="text-sm text-sky-700 underline">Bandeja</Link>
        {pipeline && <Link href={`/pipelines/${pipeline.id}`} className="text-sm text-sky-700 underline">Pipeline</Link>}
      </nav>
      <DashboardClient tags={tags ?? []} channels={channels ?? []} />
    </main>
  );
}
