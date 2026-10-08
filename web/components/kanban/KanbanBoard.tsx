"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import { Column } from "./Column";
import { DealCardView } from "./DealCard";
import { NewDealForm } from "./NewDealForm";
import type { Agent, Deal, Stage } from "./types";

type Props = {
  pipelineId: string;
  stages: Stage[];
  initialDeals: Deal[];
  agents: Agent[];
};

// ordena por posición dentro de cada etapa
const sortDeals = (deals: Deal[]) =>
  [...deals].sort((a, b) => a.position - b.position);

export function KanbanBoard({ pipelineId, stages, initialDeals, agents }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [deals, setDeals] = useState<Deal[]>(sortDeals(initialDeals));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function reload() {
    const { data } = await supabase
      .from("deals")
      .select("id, stage_id, title, value, position, assignee_id, contact:contacts(name, phone_number)")
      .eq("pipeline_id", pipelineId);
    if (data) setDeals(sortDeals(data as unknown as Deal[]));
  }

  // Realtime: refrescar cuando otro usuario mueve/crea deals
  useEffect(() => {
    const channel = supabase
      .channel(`deals:${pipelineId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `pipeline_id=eq.${pipelineId}` },
        () => {
          if (!activeId) reload(); // no pisar un arrastre en curso
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, pipelineId, activeId]);

  const visible = deals.filter((d) => agentFilter === "all" || d.assignee_id === agentFilter);
  const byStage = (stageId: string) => visible.filter((d) => d.stage_id === stageId);
  const activeDeal = deals.find((d) => d.id === activeId) ?? null;

  const stageOf = (id: string) =>
    stages.find((s) => s.id === id)?.id ?? deals.find((d) => d.id === id)?.stage_id;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  // al pasar sobre otra columna, mover la tarjeta ahí (optimista, solo local)
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = stageOf(String(active.id));
    const to = stageOf(String(over.id));
    if (!from || !to || from === to) return;
    setDeals((prev) =>
      prev.map((d) => (d.id === active.id ? { ...d, stage_id: to } : d))
    );
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const snapshot = deals;
    const id = String(active.id);
    const moved = deals.find((d) => d.id === id);
    if (!moved) return;

    // lista de la columna destino con el orden final
    let column = sortDeals(deals.filter((d) => d.stage_id === moved.stage_id));
    const oldIndex = column.findIndex((d) => d.id === id);
    const overIndex = column.findIndex((d) => d.id === over.id);
    const newIndex = overIndex >= 0 ? overIndex : oldIndex;
    column = arrayMove(column, oldIndex, newIndex);

    // reasignar posiciones 0..n en la columna destino
    const positions = new Map(column.map((d, i) => [d.id, i]));
    setDeals((prev) =>
      sortDeals(prev.map((d) => (positions.has(d.id) ? { ...d, position: positions.get(d.id)! } : d)))
    );

    const { error: rpcError } = await supabase.rpc("move_deal", {
      p_deal_id: id,
      p_stage_id: moved.stage_id,
      p_position: newIndex,
    });
    if (rpcError) {
      setDeals(snapshot); // rollback
      setError("No se pudo mover la tarjeta. Se restauró su posición.");
      setTimeout(() => setError(null), 4000);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600" htmlFor="agent">Agente</label>
        <select
          id="agent"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="all">Todos</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {error && <span className="text-sm text-red-600" role="alert">{error}</span>}
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Nuevo deal
        </button>
      </div>
      {showForm && (
        <NewDealForm
          pipelineId={pipelineId}
          stages={stages}
          onCreated={reload}
          onClose={() => setShowForm(false)}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {[...stages].sort((a, b) => a.order_position - b.order_position).map((s) => (
            <Column key={s.id} stage={s} deals={byStage(s.id)} />
          ))}
        </div>
        <DragOverlay>{activeDeal ? <DealCardView deal={activeDeal} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
