import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutomationEditor } from "@/components/automations/AutomationEditor";
import type { Automation, Folder, RunWithLog } from "@/components/automations/types";

export default async function AutomationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: automation }, { data: folders }, { data: runs }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("automations")
      .select("id, name, trigger_type, conditions, actions_tree_json, enabled, folder_id").eq("id", params.id).maybeSingle(),
    supabase.from("automation_folders").select("id, name").order("name"),
    supabase.from("automation_runs").select("id, status, created_at, log")
      .eq("automation_id", params.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!me) redirect("/");
  if (!automation) notFound();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <AutomationEditor
        automation={automation as unknown as Automation}
        folders={(folders ?? []) as Folder[]}
        runs={(runs ?? []) as unknown as RunWithLog[]}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
