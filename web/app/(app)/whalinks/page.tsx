import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhalinksClient, type Whalink } from "@/components/whalinks/WhalinksClient";

export default async function WhalinksPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: links }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("whalinks")
      .select("id, name, slug, message, tag_name, clicks, leads, created_at, channel_id, channel:channels(name, phone_number)")
      .order("created_at", { ascending: false }),
    supabase.from("channels").select("id, name, phone_number").order("created_at"),
  ]);
  if (!me) redirect("/");

  return (
    <WhalinksClient
        links={(links ?? []) as unknown as Whalink[]}
        channels={(channels ?? []).filter((c) => c.phone_number).map((c) => ({ id: c.id, name: c.name, phone: c.phone_number as string }))}
        isAdmin={me.role === "admin"}
    />
  );
}
