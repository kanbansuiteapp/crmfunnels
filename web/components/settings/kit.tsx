"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";

export const MON = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export function fmtDate(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}, ${String(h % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function useMe() {
  const [me, setMe] = useState<{ orgId: string; role: string; userId: string } | null>(null);
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data }) => {
      const id = data.user?.id;
      if (!id) return;
      const { data: p } = await sb.from("profiles").select("organization_id, role").eq("id", id).single();
      if (p) setMe({ orgId: p.organization_id as string, role: p.role as string, userId: id });
    });
  }, []);
  return me;
}

export function useSort<T>(rows: T[], init: { key: keyof T; dir: 1 | -1 }) {
  const [s, setS] = useState(init);
  const sorted = [...rows].sort((a, b) => {
    const x = a[s.key] as unknown as string | number, y = b[s.key] as unknown as string | number;
    return (typeof x === "string" ? x.localeCompare(y as string, "es", { sensitivity: "base" }) : (x as number) - (y as number)) * s.dir;
  });
  const toggle = (key: keyof T) => setS((c) => (c.key === key ? { key, dir: (c.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  return { sorted, toggle };
}

export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";
export const btnOutline = "inline-flex items-center justify-center gap-2 rounded-md border border-indigo-500 bg-white px-5 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50";
export const inputCls = "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400";

export function Page({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="w-full p-6 md:px-10 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        {actions && <div className="flex gap-3">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex w-full max-w-md items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-slate-400 focus-within:border-indigo-400">
      <Icon name="search" size={18} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar por nombre" className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
    </label>
  );
}

export function FilterButton({ active, children }: { active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "bg-slate-50 text-slate-800 hover:bg-slate-100"}`}>
        <Icon name="filter" size={18} /> Filtrar
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-100 bg-white p-4 shadow-xl">
          {children}
          <button onClick={() => setOpen(false)} className={`${btnPrimary} mt-4 w-full`}>Cerrar</button>
        </div>
      )}
    </div>
  );
}

export function Toolbar({ left, onClear, filter }: { left: ReactNode; onClear: () => void; filter?: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      {left}
      <div className="flex items-center gap-4">
        <button onClick={onClear} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Limpiar todos los filtros</button>
        {filter}
      </div>
    </div>
  );
}

export function Th({ children, onSort, className = "" }: { children: ReactNode; onSort?: () => void; className?: string }) {
  return (
    <th className={`px-3 py-4 text-left text-sm font-semibold text-slate-900 ${className}`}>
      {onSort ? <button onClick={onSort} className="inline-flex items-center gap-1">{children}<Icon name="sort" size={16} /></button> : children}
    </th>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-indigo-500" />;
}

export function Modal({ title, description, onClose, children, wide }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative my-auto w-full ${wide ? "max-w-xl" : "max-w-lg"} rounded-xl bg-white p-8 shadow-2xl`}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute right-5 top-4 text-3xl leading-none text-slate-700 hover:text-black">×</button>
        <h2 className="text-2xl font-bold text-[#1d1b4d]">{title}</h2>
        {description && <p className="mt-3 text-slate-500">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, required, counter, error, children }: { label: string; required?: boolean; counter?: string; error?: string; children: ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <label className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-900">
        <span>{label}{required && <span className="text-red-500"> *</span>}</span>
        {counter && <span className="text-xs font-normal text-slate-500">{counter}</span>}
      </label>
      {children}
      {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ModalActions({ onCancel, onOk, okLabel, disabled, busy }: { onCancel: () => void; onOk: () => void; okLabel: string; disabled?: boolean; busy?: boolean }) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-4">
      <button onClick={onCancel} className={btnOutline}>Cancelar</button>
      <button onClick={onOk} disabled={disabled || busy} className={btnPrimary}>{busy ? "Guardando..." : okLabel}</button>
    </div>
  );
}

export function Alert({ text }: { text: string | null }) {
  return text ? <p role="alert" className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{text}</p> : null;
}
export function Notice({ text }: { text: string | null }) {
  return text ? <p role="status" className="mt-4 rounded-md bg-indigo-50 px-4 py-2 text-sm text-indigo-800">{text}</p> : null;
}

export const TABLE = "mt-4 w-full border-t border-slate-100 text-sm";
export const ROW = "border-t border-slate-100 hover:bg-slate-50";
