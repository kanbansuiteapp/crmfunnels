import { createClient } from "@/lib/supabase/server";
import { Inbox } from "@/components/inbox/Inbox";
import type { Conversation } from "@/components/inbox/types";

export default async function InboxPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: conversations }, { data: channels }, { data: team }] = await Promise.all([
    supabase.rpc("inbox_conversations"),
    supabase.from("channels").select("id, name").order("created_at"),
    supabase.from("profiles").select("id, name, role").order("created_at"),
  ]);
  const meId = auth.user?.id ?? "";
  const isAdmin = team?.find((m) => m.id === meId)?.role === "admin";

  return (
    <main className="h-full p-4">
      <Inbox
        initialConversations={(conversations ?? []) as Conversation[]}
        channels={channels ?? []}
        isAdmin={isAdmin}
        meId={meId}
        team={(team ?? []).map((m) => ({ id: m.id, name: m.name }))}
      />
    </main>
  );
}
