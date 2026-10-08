import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignForm, DEFAULT_CFG, type Cfg, type Device, type ExistingGroup } from "@/components/campaigns/CampaignForm";

export default async function EditCampaignPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: channels }, { data: tags }, { data: groups }, { data: camp }] = await Promise.all([
    supabase.from("profiles").select("role, organization_id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("channels").select("id, name, phone_number, status").order("created_at"),
    supabase.from("tags").select("name").order("name"),
    supabase.from("wa_groups").select("id, name, type, participants").order("name"),
    supabase.from("group_campaigns").select("*, links:group_campaign_groups(group_id, position)").eq("id", params.id).maybeSingle(),
  ]);
  if (me?.role !== "admin") redirect("/group-campaigns");
  if (!camp) notFound();

  const initial: Cfg = {
    ...DEFAULT_CFG,
    type: camp.type, name: camp.name, description: camp.description, image_path: camp.image_path ?? "", auto_create: camp.auto_create,
    who_can_send: camp.who_can_send, admin_channel_ids: camp.admin_channel_ids, backup_admins: camp.backup_admins,
    moderation: camp.moderation, moderation_mode: camp.moderation_mode, moderation_criteria: camp.moderation_criteria,
    max_participants: camp.max_participants, max_clicks: camp.max_clicks, strategy: camp.strategy, remember_visitor: camp.remember_visitor,
    reserve_groups: camp.reserve_groups, numbering_position: camp.numbering_position, numbering_start: camp.numbering_start,
    custom_path: /^[a-z0-9]{8}$/.test(camp.slug) ? "" : camp.slug, tag_in: camp.tag_in ?? "", tag_out: camp.tag_out ?? "",
    tracking_code: camp.tracking_code, silent_protection: camp.silent_protection,
  };
  const groupIds = [...(camp.links as { group_id: string; position: number }[])].sort((a, b) => a.position - b.position).map((l) => l.group_id);
  const devices: Device[] = (channels ?? []).map((c) => ({
    id: c.id, name: c.name, phone: c.phone_number ?? "", connected: c.status === "connected" || c.status === "open",
  }));

  return (
    <main className="p-4 md:p-5">
      <CampaignForm orgId={me.organization_id ?? ""} devices={devices} tags={(tags ?? []).map((t) => t.name)} groups={(groups ?? []) as ExistingGroup[]}
        campaignId={camp.id} initial={initial} initialGroupIds={groupIds} />
    </main>
  );
}
