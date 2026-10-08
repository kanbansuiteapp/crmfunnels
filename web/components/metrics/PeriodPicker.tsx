"use client";

import { useState } from "react";
import { iso } from "./period";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const key = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

function Month({ y, m, from, to, onPick }: { y: number; m: number; from: Date | null; to: Date | null; onPick: (d: Date) => void }) {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // semana desde lunes
  const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - lead + i));
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-4 text-center text-lg font-semibold text-[#1d1b4d]">{MONTHS[m]} {y}</p>
      <div className="grid grid-cols-7 border-b pb-2 text-center text-xs font-semibold text-slate-600">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-sm">
        {cells.map((d, i) => {
          const out = d.getMonth() !== m;
          const k = key(d);
          const edge = (from && k === key(from)) || (to && k === key(to));
          const inside = from && to && k > key(from) && k < key(to);
          return (
            <button key={i} onClick={() => onPick(d)}
              className={`mx-auto h-10 w-10 rounded-full ${edge ? "bg-indigo-500 text-white" : inside ? "bg-indigo-100 text-indigo-800" : out ? "text-slate-300" : "text-slate-800 hover:bg-slate-100"}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PeriodPicker({ onApply, onCancel }: { onApply: (from: string, to: string) => void; onCancel: () => void }) {
  const now = new Date();
  const [base, setBase] = useState(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);

  const pick = (d: Date) => {
    if (!from || to) { setFrom(d); setTo(null); }
    else if (key(d) < key(from)) { setFrom(d); }
    else setTo(d);
  };
  const shift = (n: number) => setBase(new Date(base.getFullYear(), base.getMonth() + n, 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Seleccionar período" className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#1d1b4d]">Seleccionar período</h2>
          <button onClick={onCancel} aria-label="Cerrar" className="text-3xl leading-none text-slate-600">×</button>
        </div>
        <div className="relative mt-6 flex gap-8">
          <button onClick={() => shift(-1)} aria-label="Mes anterior" className="absolute left-0 top-0 z-10 rounded p-1 text-2xl leading-none text-indigo-500 hover:bg-slate-100">‹</button>
          <button onClick={() => shift(1)} aria-label="Mes siguiente" className="absolute right-0 top-0 z-10 rounded p-1 text-2xl leading-none text-indigo-500 hover:bg-slate-100">›</button>
          <Month y={base.getFullYear()} m={base.getMonth()} from={from} to={to} onPick={pick} />
          <div className="hidden min-w-0 flex-1 sm:block"><Month y={next.getFullYear()} m={next.getMonth()} from={from} to={to} onPick={pick} /></div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-md border border-indigo-500 px-6 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">Cancelar</button>
          <button disabled={!from} onClick={() => onApply(iso(from!), iso(to ?? from!))}
            className="rounded-md bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">Aplicar</button>
        </div>
      </div>
    </div>
  );
}
