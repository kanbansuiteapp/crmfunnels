import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: tags }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("channels").select("id, name").order("created_at"),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      <DashboardClient tags={tags ?? []} channels={channels ?? []} />
    </main>
  );
}
