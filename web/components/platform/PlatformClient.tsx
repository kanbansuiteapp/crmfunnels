"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, btnOutline, btnPrimary, Field, fmtDate, inputCls, Modal, ModalActions, Notice, ROW, SearchBox, TABLE, Th } from "@/components/settings/kit";

type Company = {
  id: string; name: string; plan_name: string; active: boolean; created_at: string;
  max_agents: number | null; max_devices: number | null; max_contacts: number | null;
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

function Limits({ v, set }: { v: { a: string; d: string; c: string }; set: (n: { a: string; d: string; c: string }) => void }) {
  const f = (k: "a" | "d" | "c", label: string) => (
    <Field label={label}>
      <input inputMode="numeric" value={v[k]} onChange={(e) => set({ ...v, [k]: e.target.value.replace(/\D/g, "") })} placeholder="Sin límite" className={inputCls} />
    </Field>
  );
  return (
    <div>
      <p className="mt-6 text-sm font-semibold text-slate-900">Límites del plan <span className="font-normal text-slate-500">(vacío = sin límite)</span></p>
      <div className="grid grid-cols-3 gap-4">{f("a", "Vendedores")}{f("d", "Dispositivos")}{f("c", "Contactos")}</div>
    </div>
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
    <Modal title={company ? "Editar empresa" : "Nueva empresa"} description={company ? "Cambia el nombre, el plan y los límites de esta empresa." : "Crea la empresa y el acceso de su titular (correo y contraseña). Él creará a sus vendedores."} onClose={onClose} wide>
      <Field label="Nombre de la empresa" required><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus /></Field>
      <Field label="Nombre del plan"><input value={plan} maxLength={60} onChange={(e) => setPlan(e.target.value)} placeholder="Ej. Plan Pro" className={inputCls} /></Field>
      {!company && (
        <>
          <Field label="Nombre del titular"><input value={ownerName} maxLength={80} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} /></Field>
          <Field label="Correo del titular" required><input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="empresa@correo.com" className={inputCls} /></Field>
          <Field label="Contraseña inicial" required><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="off" className={inputCls} /></Field>
        </>
      )}
      <Limits v={lim} set={setLim} />
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
                  <td className={`px-3 py-3 ${over(c.contacts, c.max_contacts) ? "font-semibold text-amber-600" : "text-slate-600"}`}>{usage(c.contacts, c.max_contacts)}</td>
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
        <p className="mt-3 text-xs text-slate-500">Los contactos son un límite informativo: se muestran, pero hoy no bloquean mensajes entrantes. Vendedores y dispositivos sí se bloquean al llegar al límite.</p>
      </main>

      {modal?.t === "new" && <CompanyModal company={null} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNote(m); load(); }} />}
      {modal?.t === "edit" && <CompanyModal company={modal.c} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNote(m); load(); }} />}
      {modal?.t === "pw" && <PasswordModal company={modal.c} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNote(m); }} />}
    </div>
  );
}
