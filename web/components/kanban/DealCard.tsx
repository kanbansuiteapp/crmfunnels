"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Deal } from "./types";

export function DealCardView({ deal }: { deal: Deal }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <p className="text-sm font-medium">{deal.title}</p>
      <p className="text-xs text-slate-500">
        {deal.contact?.name ?? deal.contact?.phone_number ?? "Sin contacto"}
      </p>
      {deal.value > 0 && (
        <p className="mt-1 text-xs font-semibold text-emerald-600">
          ${deal.value.toLocaleString()}
        </p>
      )}
    </div>
  );
}

export function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id, data: { type: "deal", stageId: deal.stage_id } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
      {...attributes}
      {...listeners}
    >
      <DealCardView deal={deal} />
    </div>
  );
}
