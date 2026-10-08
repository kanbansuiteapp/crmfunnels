"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Deal } from "./types";

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const money = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });

export function DealCardView({ deal, assignee }: { deal: Deal; assignee?: string | null }) {
  const contact = deal.contact?.name || deal.contact?.phone_number || "Sin contacto";
  return (
    <div className="cursor-grab rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow active:cursor-grabbing">
      <p className="text-sm font-semibold text-slate-900">{deal.title}</p>
      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700" aria-hidden>{initials(contact)}</span>
        <span className="truncate">{contact}</span>
      </p>
      <div className="mt-3 flex items-center justify-between">
        {deal.value > 0
          ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">${money.format(deal.value)}</span>
          : <span className="text-xs text-slate-400">Sin valor</span>}
        {assignee && <span title={assignee} className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">{initials(assignee)}</span>}
      </div>
    </div>
  );
}

export function DealCard({ deal, assignee }: { deal: Deal; assignee?: string | null }) {
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
      <DealCardView deal={deal} assignee={assignee} />
    </div>
  );
}
