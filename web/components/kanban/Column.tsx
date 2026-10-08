"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DealCard } from "./DealCard";
import type { Deal, Stage } from "./types";

const money = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

export function Column({ stage, color, deals, agents }: { stage: Stage; color: string; deals: Deal[]; agents: Map<string, string> }) {
  // la columna también es zona de drop para poder soltar sobre columnas vacías
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: "stage" } });
  const total = deals.reduce((a, d) => a + (d.value || 0), 0);

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={`flex w-[300px] shrink-0 flex-col rounded-2xl border bg-slate-50 transition xl:min-w-[260px] xl:flex-1 xl:basis-0 ${isOver ? "border-indigo-300 ring-2 ring-indigo-200" : "border-slate-100"}`}
    >
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
          <h3 className="truncate text-sm font-semibold text-slate-900">{stage.name}</h3>
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm">{deals.length}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{total > 0 ? `$${money.format(total)}` : "Sin valor"}</p>
        <div className="mt-3 h-1 rounded-full" style={{ background: color, opacity: 0.55 }} aria-hidden />
      </header>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-24 flex-1 flex-col gap-3 px-3 pb-3">
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} assignee={d.assignee_id ? agents.get(d.assignee_id) ?? null : null} />
          ))}
          {deals.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">Sin deals. Arrastra uno aquí.</p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
