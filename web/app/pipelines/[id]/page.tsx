import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { Deal, Stage } from "@/components/kanban/types";

export default async function PipelinePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: pipeline }, { data: stages }, { data: deals }, { data: agents }] =
    await Promise.all([
      supabase.from("pipelines").select("id, name").eq("id", params.id).single(),
      supabase.from("stages").select("id, name, order_position").eq("pipeline_id", params.id),
      supabase
        .from("deals")
        .select("id, stage_id, title, value, position, assignee_id, contact:contacts(name, phone_number)")
        .eq("pipeline_id", params.id),
      supabase.from("profiles").select("id, name"),
    ]);

  if (!pipeline) notFound();

  return (
    <main className="flex h-screen flex-col p-4">
      <h1 className="mb-3 text-xl font-semibold">{pipeline.name}</h1>
      <KanbanBoard
        pipelineId={pipeline.id}
        stages={(stages ?? []) as Stage[]}
        initialDeals={(deals ?? []) as unknown as Deal[]}
        agents={agents ?? []}
      />
    </main>
  );
}
