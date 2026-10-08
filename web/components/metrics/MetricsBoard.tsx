"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";
import { AddCardModal, type NewCard } from "./AddCardModal";
import { ChartView, type MetricData } from "./ChartView";
import type { Variant } from "./metricsCatalog";
import { periodLabel, resolvePeriod, type Period, type PeriodKind } from "./period";

type Board = { id: string; name: string };
type Card = { id: string; board_id: string; title: string; metric: string; variant: Variant; period_kind: PeriodKind; range_from: string | null; range_to: string | null; tag_ids: string[] };

const cardPeriod = (c: Card): Period => ({ kind: c.period_kind, from: c.range_from ?? undefined, to: c.range_to ?? undefined });

function CardView({ card, editing, onRemove }: { card: Card; editing: boolean; onRemove: () => void }) {
  const [data, setData] = useState<MetricData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const period = cardPeriod(card);

  useEffect(() => {
    let off = false;
    setState("loading");
    const { from, to } = resolvePeriod(period);
    createClient()
      .rpc("metric_data", { p_metric: card.metric, p_from: from, p_to: to, p_tags: card.tag_ids })
      .then(({ data, error }) => {
        if (off) return;
        if (error) setState("error"); else { setData(data as MetricData); setState("ok"); }
      });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.metric, card.period_kind, card.range_from, card.range_to, card.tag_ids.join(",")]);

  return (
    <section className="relative flex min-h-[280px] flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" aria-label={card.title}>
      {editing && (
        <button onClick={onRemove} aria-label="Quitar gráfico" title="Quitar gráfico" className="absolute right-4 top-4 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600">
          <Icon name="trash" size={18} />
        </button>
      )}
      <h2 className="pr-8 text-lg font-semibold text-slate-900">{card.title}</h2>
      <p className="mt-1 text-sm text-slate-500">Período analizado: {periodLabel(period)}</p>
      <div className="mt-3 flex flex-1 flex-col">
        <ChartView variant={card.variant} data={data} loading={state === "loading"} error={state === "error"} />
      </div>
    </section>
  );
}

export function MetricsBoard() {
  const supabase = createClient();
  const [boards, setBoards] = useState<Board[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", u.user?.id ?? "").single();
    const org = prof?.organization_id as string | undefined;
    if (!org) { setErr("No se pudo identificar tu organización."); setReady(true); return; }
    setOrgId(org);
    let { data: b } = await supabase.from("metric_boards").select("id,name").order("position").order("created_at");
    if (!b || b.length === 0) {
      const { data: created } = await supabase.from("metric_boards").insert({ organization_id: org, name: "Tablero principal", position: 0 }).select("id,name");
      b = created ?? [];
    }
    const { data: c } = await supabase.from("metric_cards").select("*").order("position").order("created_at");
    setBoards((b ?? []) as Board[]);
    setCards((c ?? []) as Card[]);
    setActiveId((cur) => cur ?? b?.[0]?.id ?? null);
    setReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = boards.find((b) => b.id === activeId) ?? boards[0];
  const shown = cards.filter((c) => c.board_id === active?.id);

  const addBoard = async () => {
    if (!orgId) return;
    const { data, error } = await supabase.from("metric_boards").insert({ organization_id: orgId, name: `Tablero ${boards.length + 1}`, position: boards.length }).select("id,name").single();
    if (error || !data) return setErr("No se pudo crear el tablero.");
    setBoards([...boards, data as Board]);
    setActiveId(data.id);
  };
  const addChart = async (n: NewCard) => {
    if (!orgId || !active) return;
    const { data, error } = await supabase.from("metric_cards").insert({
      organization_id: orgId, board_id: active.id, title: n.title, metric: n.metric, variant: n.variant,
      period_kind: n.period.kind, range_from: n.period.from ?? null, range_to: n.period.to ?? null,
      tag_ids: n.tags, position: shown.length,
    }).select("*").single();
    if (error || !data) return setErr("No se pudo guardar la tarjeta.");
    setCards([...cards, data as Card]);
    setAdding(false);
  };
  const removeChart = async (id: string) => {
    const { error } = await supabase.from("metric_cards").delete().eq("id", id);
    if (error) return setErr("No se pudo quitar la tarjeta.");
    setCards(cards.filter((c) => c.id !== id));
  };

  return (
    <main className="mx-auto max-w-7xl p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Métricas</h1>
          <p className="mt-2 text-sm text-slate-500">Visualiza y controla las métricas clave para potenciar tu gestión.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setEditing(!editing)} className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">
            <Icon name="pencil" size={18} /> {editing ? "Listo" : "Editar cuadro de mando"}
          </button>
          <button onClick={() => setAdding(true)} disabled={!active} className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
            <span className="text-lg leading-none">+</span> Nuevo gráfico
          </button>
        </div>
      </div>

      {err && <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{err}</p>}

      <div className="mt-8 flex items-center gap-8 overflow-x-auto border-b border-slate-100" role="tablist">
        {boards.map((b) => (
          <button key={b.id} role="tab" aria-selected={b.id === active?.id} onClick={() => setActiveId(b.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${b.id === active?.id ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {b.name}
          </button>
        ))}
        <button onClick={addBoard} disabled={!orgId} className="-mb-px flex items-center gap-1.5 whitespace-nowrap pb-3 text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
          <span className="text-lg leading-none">+</span> Agregar tablero
        </button>
      </div>

      {!ready ? (
        <p className="mt-16 text-center text-slate-500">Cargando...</p>
      ) : shown.length === 0 ? (
        <p className="mt-16 text-center text-slate-500">Este tablero no tiene gráficos. Usa “Nuevo gráfico” para añadir el primero.</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => <CardView key={c.id} card={c} editing={editing} onRemove={() => removeChart(c.id)} />)}
        </div>
      )}
      {adding && <AddCardModal onClose={() => setAdding(false)} onAdd={addChart} />}
    </main>
  );
}
