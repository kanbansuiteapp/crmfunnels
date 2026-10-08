import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FlowEditor } from "@/components/automations/flow/FlowEditor";
import type { Automation, Folder, RunWithLog } from "@/components/automations/types";

export default async function AutomationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: automation }, { data: folders }, { data: runs }, { data: team }, { data: tags }, { data: hooks }] = await Promise.all([
    supabase.from("profiles").select("role, organization_id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("automations")
      .select("id, name, trigger_type, conditions, actions_tree_json, enabled, folder_id").eq("id", params.id).maybeSingle(),
    supabase.from("automation_folders").select("id, name").order("name"),
    supabase.from("automation_runs").select("id, status, created_at, log")
      .eq("automation_id", params.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("profiles").select("id, name").order("created_at"),
    supabase.from("tags").select("name").order("name"),
    supabase.from("webhooks").select("id, name").eq("direction", "in").order("created_at"),
  ]);
  if (!me) redirect("/");
  if (!automation) notFound();

  return (
    <main className="h-full">
      <FlowEditor
        // la clave fuerza a recrear el lienzo cuando cambia la versión guardada
        key={`${automation.id}:${JSON.stringify(automation.actions_tree_json).length}`}
        automation={automation as unknown as Automation}
        folders={(folders ?? []) as Folder[]}
        runs={(runs ?? []) as unknown as RunWithLog[]}
        agents={team ?? []} orgId={me?.organization_id ?? ""} tags={(tags ?? []).map((t) => t.name)} hooks={hooks ?? []}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
