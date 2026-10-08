"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DealCard } from "./DealCard";
import type { Deal, Stage } from "./types";

export function Column({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  // la columna también es zona de drop para poder soltar sobre columnas vacías
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: "stage" } });

  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2 ${
        isOver ? "ring-2 ring-sky-400" : ""
      }`}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{stage.name}</h3>
        <span className="text-xs text-slate-500">{deals.length}</span>
      </header>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-16 flex-col gap-2">
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
