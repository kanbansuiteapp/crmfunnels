import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GroupsTable, type WaGroup } from "@/components/groups/GroupsTable";

export default async function GroupsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: groups }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("wa_groups")
      .select("id, name, origin, type, clicks, admins, participants, scheduled_messages, capacity, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("channels").select("id, name").order("created_at"),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-7xl p-6">
      <GroupsTable groups={(groups ?? []) as WaGroup[]} devices={channels ?? []} isAdmin={me.role === "admin"} />
    </main>
  );
}
