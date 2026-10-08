import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Inbox } from "@/components/inbox/Inbox";
import type { Conversation } from "@/components/inbox/types";

export default async function InboxPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: conversations }, { data: channels }, { data: pipeline }, { data: team }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, assignee_id, last_message_at, contact:contacts(id, name, phone_number)")
      .order("last_message_at", { ascending: false }),
    supabase.from("channels").select("id, name"),
    supabase.from("pipelines").select("id").order("created_at").limit(1).maybeSingle(),
    supabase.from("profiles").select("id, name, role").order("created_at"),
  ]);
  const isAdmin = team?.find((m) => m.id === auth.user?.id)?.role === "admin";

  return (
    <main className="flex h-screen flex-col p-4">
      <nav className="mb-3 flex items-center gap-4">
        <h1 className="text-xl font-semibold">Bandeja</h1>
        {pipeline && (
          <Link href={`/pipelines/${pipeline.id}`} className="text-sm text-sky-700 underline">
            Pipeline
          </Link>
        )}
        <Link href="/team" className="text-sm text-sky-700 underline">Equipo</Link>
        <Link href="/automations" className="text-sm text-sky-700 underline">Automatizaciones</Link>
      </nav>
      <Inbox
        initialConversations={(conversations ?? []) as unknown as Conversation[]}
        hasChannels={(channels ?? []).length > 0}
        isAdmin={isAdmin}
        team={(team ?? []).map((m) => ({ id: m.id, name: m.name }))}
      />
    </main>
  );
}
