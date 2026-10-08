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
    <main className="flex h-full min-h-0 w-full flex-col p-6 md:px-10 md:py-8">
      <h1 className="text-3xl font-semibold text-slate-900">Tableros</h1>
      <p className="mt-2 text-sm text-slate-500">Organiza tus oportunidades de venta por etapas y arrástralas para avanzar.</p>
      <div className="mb-6 mt-6 flex items-center gap-8 border-b border-slate-100" role="tablist">
        <span role="tab" aria-selected="true" className="-mb-px border-b-2 border-indigo-500 px-1 pb-3 text-sm font-medium text-indigo-600">{pipeline.name}</span>
      </div>
      <KanbanBoard
        pipelineId={pipeline.id}
        stages={(stages ?? []) as Stage[]}
        initialDeals={(deals ?? []) as unknown as Deal[]}
        agents={agents ?? []}
      />
    </main>
  );
}
