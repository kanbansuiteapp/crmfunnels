import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FlowEditor } from "@/components/automations/flow/FlowEditor";
import type { Folder } from "@/components/automations/types";

export default async function NewAutomationPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: folders }, { data: team }, { data: tags }, { data: hooks }] = await Promise.all([
    supabase.from("profiles").select("role, organization_id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("automation_folders").select("id, name").order("name"),
    supabase.from("profiles").select("id, name").order("created_at"),
    supabase.from("tags").select("name").order("name"),
    supabase.from("webhooks").select("id, name").eq("direction", "in").order("created_at"),
  ]);
  if (me?.role !== "admin") redirect("/automations"); // solo administradores crean automatizaciones

  return (
    <main className="h-full">
      <FlowEditor folders={(folders ?? []) as Folder[]} runs={[]} agents={team ?? []} orgId={me?.organization_id ?? ""} tags={(tags ?? []).map((t) => t.name)} hooks={hooks ?? []} isAdmin />
    </main>
  );
}
