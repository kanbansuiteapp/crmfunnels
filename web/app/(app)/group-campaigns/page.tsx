import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignsClient, type Campaign, type GroupLite } from "@/components/campaigns/CampaignsClient";

type RawGroup = {
  id: string; name: string; type: GroupLite["type"]; participants: number; admins: number; capacity: number | null;
  avatar_url: string | null; channel: { status: string } | null;
};
const lite = (g: RawGroup): GroupLite => ({
  id: g.id, name: g.name, type: g.type, participants: g.participants, admins: g.admins, capacity: g.capacity, avatar_url: g.avatar_url,
  connected: g.channel?.status === "connected" || g.channel?.status === "open",
});

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const groupCols = "id, name, type, participants, admins, capacity, avatar_url, channel:channels(status)";
  const [{ data: me }, { data: camps }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("group_campaigns")
      .select(`id, name, slug, type, clicks, links:group_campaign_groups(position, group:wa_groups(${groupCols}))`)
      .order("created_at", { ascending: false }),
  ]);
  if (!me) redirect("/");

  const campaigns: Campaign[] = ((camps ?? []) as unknown as (Omit<Campaign, "groups"> & { links: { position: number; group: RawGroup | null }[] })[]).map((c) => ({
    id: c.id, name: c.name, slug: c.slug, type: c.type, clicks: c.clicks,
    groups: [...c.links].sort((a, b) => a.position - b.position).flatMap((l) => (l.group ? [lite(l.group)] : [])),
  }));

  return (
    <main className="p-4 md:p-5">
      <CampaignsClient campaigns={campaigns} isAdmin={me.role === "admin"} />
    </main>
  );
}
