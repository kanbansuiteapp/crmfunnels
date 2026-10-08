import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgentsClient } from "@/components/agents/AgentsClient";
import type { Agent, ChannelRow, Source } from "@/components/agents/types";

export default async function AgentsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: agents }, { data: channels }, { data: sources }, { data: team }, { data: kbBytes }] = await Promise.all([
    supabase.from("ai_agents")
      .select("id, name, system_prompt, model, ai_key_set, allowed_tags, collect_fields, description, objective, active").order("created_at"),
    supabase.from("channels").select("id, name, ai_agent_id").order("created_at"),
    supabase.from("knowledge_sources").select("id, agent_id, kind, title").order("created_at"),
    supabase.from("profiles").select("id, role"),
    supabase.rpc("kb_size"),
  ]);
  const me = team?.find((m) => m.id === auth.user?.id);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-7xl p-6">
      <AgentsClient
        agents={(agents ?? []) as Agent[]}
        channels={(channels ?? []) as ChannelRow[]}
        sources={(sources ?? []) as Source[]}
        kbBytes={Number(kbBytes ?? 0)}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
