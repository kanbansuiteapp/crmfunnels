import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgentsClient } from "@/components/agents/AgentsClient";
import type { Agent, ChannelRow, Source } from "@/components/agents/types";

export default async function AgentsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: agents }, { data: channels }, { data: sources }, { data: team }] = await Promise.all([
    supabase.from("ai_agents")
      .select("id, name, system_prompt, model, ai_key_set, allowed_tags, collect_fields").order("created_at"),
    supabase.from("channels").select("id, name, ai_agent_id").order("created_at"),
    supabase.from("knowledge_sources").select("id, agent_id, kind, title").order("created_at"),
    supabase.from("profiles").select("id, role"),
  ]);
  const me = team?.find((m) => m.id === auth.user?.id);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-5xl p-4">
      <nav className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold">Agentes IA</h1>
        <Link href="/inbox" className="text-sm text-sky-700 underline">Bandeja</Link>
      </nav>
      {me.role !== "admin" && (
        <p className="mb-4 text-sm text-slate-500">Solo los administradores pueden editar los agentes.</p>
      )}
      <AgentsClient
        agents={(agents ?? []) as Agent[]}
        channels={(channels ?? []) as ChannelRow[]}
        sources={(sources ?? []) as Source[]}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
