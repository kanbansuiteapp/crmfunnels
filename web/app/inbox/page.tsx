import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Inbox } from "@/components/inbox/Inbox";
import type { Conversation } from "@/components/inbox/types";

export default async function InboxPage() {
  const supabase = createClient();
  const [{ data: conversations }, { data: channels }, { data: pipeline }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, assignee_id, last_message_at, contact:contacts(name, phone_number)")
      .order("last_message_at", { ascending: false }),
    supabase.from("channels").select("id, name"),
    supabase.from("pipelines").select("id").order("created_at").limit(1).maybeSingle(),
  ]);

  return (
    <main className="flex h-screen flex-col p-4">
      <nav className="mb-3 flex items-center gap-4">
        <h1 className="text-xl font-semibold">Bandeja</h1>
        {pipeline && (
          <Link href={`/pipelines/${pipeline.id}`} className="text-sm text-sky-700 underline">
            Pipeline
          </Link>
        )}
      </nav>
      <Inbox
        initialConversations={(conversations ?? []) as unknown as Conversation[]}
        hasChannels={(channels ?? []).length > 0}
      />
    </main>
  );
}
