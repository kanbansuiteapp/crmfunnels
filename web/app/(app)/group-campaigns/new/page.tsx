import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignForm, type Device, type ExistingGroup } from "@/components/campaigns/CampaignForm";

export default async function NewCampaignPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: channels }, { data: tags }, { data: groups }] = await Promise.all([
    supabase.from("profiles").select("role, organization_id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("channels").select("id, name, phone_number, status").order("created_at"),
    supabase.from("tags").select("name").order("name"),
    supabase.from("wa_groups").select("id, name, type, participants").order("name"),
  ]);
  if (me?.role !== "admin") redirect("/group-campaigns"); // solo administradores crean campañas

  const devices: Device[] = (channels ?? []).map((c) => ({
    id: c.id, name: c.name, phone: c.phone_number ?? "", connected: c.status === "connected" || c.status === "open",
  }));
  return (
    <main className="p-4 md:p-5">
      <CampaignForm orgId={me.organization_id ?? ""} devices={devices} tags={(tags ?? []).map((t) => t.name)} groups={(groups ?? []) as ExistingGroup[]} />
    </main>
  );
}
