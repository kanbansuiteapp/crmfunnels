import { createClient } from "@/lib/supabase/server";
import { Inbox } from "@/components/inbox/Inbox";
import type { Conversation } from "@/components/inbox/types";

export default async function InboxPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: conversations }, { data: channels }, { data: team }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, assignee_id, ai_enabled, last_message_at, contact:contacts(id, name, phone_number)")
      .order("last_message_at", { ascending: false }),
    supabase.from("channels").select("id, name"),
    supabase.from("profiles").select("id, name, role").order("created_at"),
  ]);
  const isAdmin = team?.find((m) => m.id === auth.user?.id)?.role === "admin";

  return (
    <main className="flex h-full flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">Bandeja</h1>
      <Inbox
        initialConversations={(conversations ?? []) as unknown as Conversation[]}
        hasChannels={(channels ?? []).length > 0}
        isAdmin={isAdmin}
        team={(team ?? []).map((m) => ({ id: m.id, name: m.name }))}
      />
    </main>
  );
}
