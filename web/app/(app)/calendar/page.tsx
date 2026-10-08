import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessagesClient, type GroupMessage } from "@/components/messages/MessagesClient";

export default async function ScheduledMessagesPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: items }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("group_messages")
      .select("id, name, message, scheduled_at, status, total, sent, failed, read_rate, targets:group_message_targets(status, error, group:wa_groups(name))")
      .order("scheduled_at", { ascending: false }).limit(300),
  ]);
  if (!me) redirect("/");

  return (
    <main className="p-4 md:p-5">
      <MessagesClient items={(items ?? []) as unknown as GroupMessage[]} isAdmin={me.role === "admin"} />
    </main>
  );
}
