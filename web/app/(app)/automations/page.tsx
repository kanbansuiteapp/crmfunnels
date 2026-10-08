import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutomationsList } from "@/components/automations/AutomationsList";
import { WebhookCard } from "@/components/automations/WebhookCard";
import type { AutomationRow, Folder } from "@/components/automations/types";

export default async function AutomationsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: items }, { data: folders }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("automations")
      .select("id, name, trigger_type, conditions, enabled, created_at, folder_id, runs:automation_runs(count)")
      .order("created_at", { ascending: false }),
    supabase.from("automation_folders").select("id, name").order("name"),
  ]);
  if (!me) redirect("/");
  const isAdmin = me.role === "admin";

  return (
    <main className="mx-auto max-w-6xl space-y-10 p-6">
      <AutomationsList items={(items ?? []) as unknown as AutomationRow[]} folders={(folders ?? []) as Folder[]} isAdmin={isAdmin} />
      {isAdmin && <WebhookCard />}
    </main>
  );
}
