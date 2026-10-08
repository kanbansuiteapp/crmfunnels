import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutomationsClient } from "@/components/automations/AutomationsClient";
import type { Automation, Run } from "@/components/automations/types";

export default async function AutomationsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: automations }, { data: runs }, { data: team }] = await Promise.all([
    supabase.from("automations")
      .select("id, name, trigger_type, conditions, actions_tree_json, enabled").order("created_at"),
    supabase.from("automation_runs")
      .select("id, status, created_at, automation:automations(name)")
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("profiles").select("id, role"),
  ]);
  const me = team?.find((m) => m.id === auth.user?.id);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Automatizaciones</h1>
      <AutomationsClient
        automations={(automations ?? []) as unknown as Automation[]}
        runs={(runs ?? []) as unknown as Run[]}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
