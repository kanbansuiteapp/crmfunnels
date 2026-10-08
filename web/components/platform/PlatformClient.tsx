"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, btnOutline, btnPrimary, Field, fmtDate, inputCls, Modal, ModalActions, Notice, ROW, SearchBox, TABLE, Th } from "@/components/settings/kit";

type Company = {
  id: string; name: string; plan_name: string; active: boolean; created_at: string;
  max_agents: number | null; max_devices: number | null; max_contacts: number | null; contact_limit_hits: number;
  agents: number; devices: number; contacts: number; owner_name: string; owner_email: string;
};
const nf = new Intl.NumberFormat("es-PE");

async function call(body: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
  const { data, error } = await createClient().functions.invoke("platform-admin", { body });
  if (data?.error) return { data: null, error: data.error as string };
  if (error) {
    let msg: string | undefined;
    try { msg = (await (error as { context: Response }).context.json()).error; } catch { /* sin detalle */ }
    return { data: null, error: msg ?? "No se pudo completar la acción." };
  }
  return { data, error: null };
}

const usage = (n: number, max: number | null) => (max == null ? `${nf.format(n)} / ∞` : `${nf.format(n)} / ${nf.format(max)}`);
const over = (n: number, max: number | null) => max != null && n >= max;

// "" = sin límite; si no, entero >= 0
const parseLimit = (v: string): number | null | "bad" => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : "bad";
};

type LimitVals = { a: string; d: string; c: string };

// Tarjeta de un límite: interruptor "Sin límite", contador con − / + y valores rápidos
function LimitCard({ label, hint, icon, value, onChange, presets, used }: {
  label: string; hint: string; icon: string; value: string; onChange: (v: string) => void; presets: number[]; used?: number;
}) {
  const unlimited = value === "";
  const n = Number(value) || 0;
  const step = presets[0] >= 1000 ? 500 : 1;
  const tooLow = !unlimited && used != null && n < used;
  return (
    <div className={`flex flex-col rounded-xl border p-4 transition ${unlimited ? "border-slate-200 bg-slate-50" : "border-indigo-200 bg-indigo-50/40"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span aria-hidden>{icon}</span>{label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
        </div>
        <button type="button" role="switch" aria-checked={!unlimited} aria-label={`Limitar ${label.toLowerCase()}`}
          onClick={() => onChange(unlimited ? String(presets[1] ?? presets[0]) : "")}
          className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${unlimited ? "bg-slate-300" : "bg-indigo-500"}`}>
          <span className={`h-5 w-5 rounded-full bg-white shadow transition ${unlimited ? "" : "translate-x-5"}`} />
        </button>
      </div>

      <div className="mt-4 flex h-12 items-center">
        {unlimited ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><span className="text-2xl leading-none text-slate-400" aria-hidden>∞</span> Sin límite</p>
        ) : (
          <div className="flex w-full items-center overflow-hidden rounded-lg border border-indigo-200 bg-white">
            <button type="button" onClick={() => onChange(String(Math.max(0, n - step)))} aria-label="Restar" className="h-12 w-11 shrink-0 text-xl text-slate-600 hover:bg-slate-50">−</button>
            <input inputMode="numeric" value={value} aria-label={`Límite de ${label.toLowerCase()}`} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
              className="h-12 w-full min-w-0 text-center text-lg font-semibold text-slate-900 outline-none" />
            <button type="button" onClick={() => onChange(String(n + step))} aria-label="Sumar" className="h-12 w-11 shrink-0 text-xl text-slate-600 hover:bg-slate-50">+</button>
          </div>
        )}
      </div>

      <div className={`mt-3 flex flex-wrap gap-1.5 ${unlimited ? "pointer-events-none opacity-40" : ""}`} aria-hidden={unlimited}>
        {presets.map((p) => (
          <button key={p} type="button" onClick={() => onChange(String(p))}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${!unlimited && n === p ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"}`}>
            {nf.format(p)}
          </button>
        ))}
      </div>

      {used != null && <p className={`mt-3 text-xs ${tooLow ? "font-medium text-amber-600" : "text-slate-500"}`}>En uso: {nf.format(used)}{tooLow ? " · ya supera este límite; no podrá crear más" : ""}</p>}
    </div>
  );
}

function Limits({ v, set, used }: { v: LimitVals; set: (n: LimitVals) => void; used?: { a: number; d: number; c: number } }) {
  return (
    <section className="mt-8" aria-label="Límites del plan">
      <div className="flex items-end justify-between">
        <h3 className="text-base font-semibold text-slate-900">Límites del plan</h3>
        <p className="text-xs text-slate-500">Apaga el interruptor para dejarlo sin límite</p>
      </div>
      <div className="mt-3 grid items-stretch gap-4 sm:grid-cols-3">
        <LimitCard label="Vendedores" hint="Usuarios con número" icon="👤" value={v.a} onChange={(x) => set({ ...v, a: x })} presets={[3, 5, 10, 25]} used={used?.a} />
        <LimitCard label="Dispositivos" hint="Números de WhatsApp" icon="📱" value={v.d} onChange={(x) => set({ ...v, d: x })} presets={[1, 2, 5, 10]} used={used?.d} />
        <LimitCard label="Contactos" hint="Contactos guardados" icon="👥" value={v.c} onChange={(x) => set({ ...v, c: x })} presets={[1000, 5000, 10000, 50000]} used={used?.c} />
      </div>
    </section>
  );
}

function CompanyModal({ company, onClose, onSaved }: { company: Company | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(company?.name ?? "");
  const [plan, setPlan] = useState(company?.plan_name ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lim, setLim] = useState({ a: company?.max_agents?.toString() ?? "", d: company?.max_devices?.toString() ?? "", c: company?.max_contacts?.toString() ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim() && (company || (/^\S+@\S+\.\S+$/.test(ownerEmail) && password.length >= 8));
  const save = async () => {
    const a = parseLimit(lim.a), d = parseLimit(lim.d), c = parseLimit(lim.c);
    if (a === "bad" || d === "bad" || c === "bad") return setErr("Los límites deben ser números enteros.");
    setBusy(true); setErr(null);
    const common = { name: name.trim(), plan_name: plan.trim() || "Plan", max_agents: a, max_devices: d, max_contacts: c };
    const r = company
      ? await call({ action: "update_company", org_id: company.id, ...common })
      : await call({ action: "create_company", ...common, owner_name: ownerName.trim(), owner_email: ownerEmail.trim(), password });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onSaved(company ? "Empresa actualizada." : `Empresa creada. Compártele a ${ownerEmail.trim()} su correo y contraseña.`);
  };

  return (
    <Modal title={company ? "Editar empresa" : "Nueva empresa"} description={company ? "Cambia el nombre, el plan y los límites de esta empresa." : "Crea la empresa y el acceso de su titular (correo y contraseña). Él creará a sus vendedores."} onClose={onClose} extra>
      <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 [&>*]:!mt-0">
        <Field label="Nombre de la empresa" required><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus /></Field>
        <Field label="Nombre del plan"><input value={plan} maxLength={60} onChange={(e) => setPlan(e.target.value)} placeholder="Ej. Plan Pro" className={inputCls} /></Field>
        {!company && (
          <>
            <Field label="Nombre del titular"><input value={ownerName} maxLength={80} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} /></Field>
            <Field label="Correo del titular" required><input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="empresa@correo.com" className={inputCls} /></Field>
            <Field label="Contraseña inicial" required><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="off" className={inputCls} /></Field>
          </>
        )}
      </div>
      <Limits v={lim} set={setLim} used={company ? { a: company.agents, d: company.devices, c: company.contacts } : undefined} />
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={save} okLabel={company ? "Guardar" : "Crear empresa"} disabled={!valid} busy={busy} />
    </Modal>
  );
}

function PasswordModal({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: (msg: string) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Restablecer contraseña" description={`Nueva contraseña para el titular de ${company.name} (${company.owner_email}).`} onClose={onClose}>
      <Field label="Nueva contraseña" required><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="off" className={inputCls} autoFocus /></Field>
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={async () => {
        setBusy(true); const r = await call({ action: "reset_owner_password", org_id: company.id, password }); setBusy(false);
        if (r.error) return setErr(r.error); onSaved("Contraseña actualizada.");
      }} okLabel="Guardar" disabled={password.length < 8} busy={busy} />
    </Modal>
  );
}

export function PlatformClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [modal, setModal] = useState<{ t: "new" } | { t: "edit" | "pw"; c: Company } | null>(null);

  const load = useCallback(async () => {
    const r = await call({ action: "list" });
    if (r.error) { setErr(r.error); setRows([]); return; }
    setRows(r.data.companies as Company[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (c: Company) => {
    if (c.active && !confirm(`¿Suspender ${c.name}? Nadie de esa empresa podrá entrar hasta que la reactives.`)) return;
    setErr(null); setNote(null);
    const r = await call({ action: "update_company", org_id: c.id, active: !c.active });
    if (r.error) return setErr(r.error);
    setNote(c.active ? `${c.name} suspendida.` : `${c.name} reactivada.`);
    load();
  };

  const needle = q.trim().toLowerCase();
  const shown = (rows ?? []).filter((c) => !needle || `${c.name} ${c.owner_email}`.toLowerCase().includes(needle));
  const stat = (label: string, value: string) => (
    <div className="min-w-[180px] flex-1 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between bg-[#1d1b4d] px-6 text-white">
        <span className="flex items-center gap-3 font-semibold">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" className="text-lime-400" aria-hidden><path d="M3 4h18v2.6H3zM5.4 8.2h13.2v2.4H5.4zM8 12.2h8v2.2H8zM10.3 15.8h3.4v2H10.3z" /></svg>
          Panel de la plataforma
        </span>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-white/80 hover:text-white">Ir a mi empresa</Link>
          <button onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }} className="text-white/80 hover:text-white">Cerrar sesión</button>
        </nav>
      </header>

      <main className="w-full p-6 md:px-10 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Empresas</h1>
            <p className="mt-2 text-sm text-slate-500">Crea las empresas que usan tu plataforma y define cuántos vendedores, dispositivos y contactos puede tener cada una.</p>
          </div>
          <button onClick={() => setModal({ t: "new" })} className={btnPrimary}><span className="text-lg leading-none">+</span> Nueva empresa</button>
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          {stat("Empresas", nf.format(rows?.length ?? 0))}
          {stat("Activas", nf.format((rows ?? []).filter((c) => c.active).length))}
          {stat("Vendedores en total", nf.format((rows ?? []).reduce((a, c) => a + c.agents, 0)))}
        </div>

        <div className="mt-6"><SearchBox value={q} onChange={setQ} /></div>
        <Notice text={note} /><Alert text={err} />
        <div className="scroll-x">
          <table className={`${TABLE} min-w-[980px]`}>
            <thead><tr><Th>Empresa</Th><Th>Plan</Th><Th>Vendedores</Th><Th>Dispositivos</Th><Th>Contactos</Th><Th>Estado</Th><Th>Creada</Th><th className="w-48" /></tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={8} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
              {rows !== null && shown.length === 0 && <tr><td colSpan={8} className="py-16 text-center text-slate-500">{rows.length === 0 ? "Aún no hay empresas. Usa “Nueva empresa” para crear la primera." : "Ninguna empresa coincide con la búsqueda."}</td></tr>}
              {shown.map((c) => (
                <tr key={c.id} className={ROW}>
                  <td className="px-3 py-3"><p className="font-medium text-slate-800">{c.name}</p><p className="text-xs text-slate-500">{c.owner_email || "Sin titular"}</p></td>
                  <td className="px-3 py-3 text-slate-600">{c.plan_name}</td>
                  <td className={`px-3 py-3 ${over(c.agents, c.max_agents) ? "font-semibold text-amber-600" : "text-slate-600"}`}>{usage(c.agents, c.max_agents)}</td>
                  <td className={`px-3 py-3 ${over(c.devices, c.max_devices) ? "font-semibold text-amber-600" : "text-slate-600"}`}>{usage(c.devices, c.max_devices)}</td>
                  <td className={`px-3 py-3 ${over(c.contacts, c.max_contacts) ? "font-semibold text-amber-600" : "text-slate-600"}`}>{usage(c.contacts, c.max_contacts)}{c.contact_limit_hits > 0 && <span className="block text-xs font-normal text-red-600">{nf.format(c.contact_limit_hits)} rechazados</span>}</td>
                  <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${c.active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{c.active ? "Activa" : "Suspendida"}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{fmtDate(c.created_at)}</td>
                  <td className="px-3 py-3">
                    <span className="flex justify-end gap-3 text-sm font-medium">
                      <button onClick={() => setModal({ t: "edit", c })} className="text-indigo-600 hover:text-indigo-800">Editar</button>
                      <button onClick={() => setModal({ t: "pw", c })} className="text-slate-600 hover:text-slate-900">Contraseña</button>
                      <button onClick={() => toggle(c)} className={c.active ? "text-red-600 hover:text-red-800" : "text-green-700 hover:text-green-900"}>{c.active ? "Suspender" : "Reactivar"}</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Al llegar al límite, la empresa deja de registrar contactos nuevos (los que ya existen siguen funcionando) y verás cuántos se rechazaron. Lo mismo ocurre con vendedores y dispositivos. Si subes el límite, el contador de rechazados se reinicia.</p>
      </main>

      {modal?.t === "new" && <CompanyModal company={null} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNote(m); load(); }} />}
      {modal?.t === "edit" && <CompanyModal company={modal.c} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNote(m); load(); }} />}
      {modal?.t === "pw" && <PasswordModal company={modal.c} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNote(m); }} />}
    </div>
  );
}
