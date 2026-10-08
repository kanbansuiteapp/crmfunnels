import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessageForm, type CampaignOpt, type Target } from "@/components/messages/MessageForm";

export default async function NewScheduledMessagePage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: groups }, { data: camps }] = await Promise.all([
    supabase.from("profiles").select("role, organization_id").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("wa_groups").select("id, name, type, participants").in("type", ["group", "community"]).order("name"),
    supabase.from("group_campaigns").select("id, name, links:group_campaign_groups(group_id)").order("name"),
  ]);
  if (me?.role !== "admin") redirect("/calendar");

  const campaigns: CampaignOpt[] = ((camps ?? []) as unknown as { id: string; name: string; links: unknown[] }[])
    .map((c) => ({ id: c.id, name: c.name, groups: c.links.length }));
  return (
    <main className="p-4 md:p-5">
      <MessageForm orgId={me.organization_id ?? ""} targets={(groups ?? []) as Target[]} campaigns={campaigns} />
    </main>
  );
}
