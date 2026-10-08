"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { COUNTRIES } from "@/lib/countries";
import { Alert, btnPrimary, Field, inputCls, Modal, ModalActions, Notice, Page, ROW, SearchBox, TABLE, Th, useMe, useSort } from "./kit";

type Agent = { id: string; name: string; email: string; phone: string; role: string; created_at: string; chat_visibility: string };
const VIS = [{ v: "assigned", l: "Solo Asignados" }, { v: "unassigned", l: "Sin asignar" }, { v: "all", l: "Todos" }];
const dmy = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const HUES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

async function call(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await createClient().functions.invoke("admin-users", { body });
  if (data?.error) return data.error as string;
  if (error) {
    try { return (await (error as { context: Response }).context.json()).error ?? "No se pudo completar la acción."; } catch { return "No se pudo completar la acción."; }
  }
  return null;
}

function AgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (phone: string) => void }) {
  const [name, setName] = useState("");
  const [cc, setCc] = useState("PE");
  const [national, setNational] = useState("");
  const [password, setPassword] = useState("");
  const [showName, setShowName] = useState(false);
  const [vis, setVis] = useState("assigned");
  const [showPw, setShowPw] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const country = COUNTRIES.find((c) => c[0] === cc)!;
  const digits = `${country[2]}${national.replace(/\D/g, "")}`;
  const phone = `+${digits}`;
  const errs = {
    name: name.trim() ? "" : "Nombre es requerido",
    phone: !national.trim() ? "El número es requerido" : digits.length < 8 || digits.length > 15 ? "Número inválido. Revisa el país y los dígitos." : "",
    password: !password ? "Contraseña es requerida" : password.length < 8 ? "La contraseña necesita 8+ caracteres" : "",
  };
  const bad = (k: keyof typeof errs) => tried && errs[k];
  const ring = (k: keyof typeof errs) => (bad(k) ? "!border-red-400" : "");

  const submit = async () => {
    setTried(true);
    if (errs.name || errs.phone || errs.password) return;
    setBusy(true); setErr(null);
    const e = await call({ name: name.trim(), phone, password, show_name: showName, chat_visibility: vis });
    setBusy(false);
    if (e) return setErr(e);
    onCreated(phone);
  };

  return (
    <Modal title="Crear nuevo vendedor" description="El vendedor entra al sistema con su número de WhatsApp y esta contraseña." onClose={onClose} wide>
      <Field label="Nombre" required error={bad("name") || undefined}>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} ${ring("name")}`} autoFocus />
      </Field>
      <Field label="Número de WhatsApp (su usuario)" required error={bad("phone") || undefined}>
        <div className={`flex overflow-hidden rounded-md border bg-white focus-within:border-indigo-400 ${bad("phone") ? "border-red-400" : "border-slate-200"}`}>
          <div className="relative flex items-center border-r border-slate-200 bg-slate-50 px-3">
            <span className="pointer-events-none text-lg leading-none" aria-hidden>{country[3]}</span>
            <span className="pointer-events-none ml-1 text-[10px] text-slate-500" aria-hidden>▾</span>
            <select aria-label="País del número" value={cc} onChange={(e) => setCc(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
              {COUNTRIES.map((c) => <option key={c[0]} value={c[0]}>{c[3]} {c[1]} (+{c[2]})</option>)}
            </select>
          </div>
          <span className="flex items-center pl-3 text-sm text-slate-500">+{country[2]}</span>
          <input type="tel" inputMode="tel" value={national} onChange={(e) => setNational(e.target.value.replace(/[^\d\s()-]/g, ""))} placeholder="912345678" className="w-full px-2 py-3 text-sm outline-none" />
        </div>
      </Field>
      <Field label="Contraseña" required error={bad("password") || undefined}>
        <div className="relative">
          <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className={`${inputCls} pr-12 ${ring("password")}`} autoComplete="new-password" />
          <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500"><Icon name={showPw ? "eye" : "eyeOff"} size={20} /></button>
        </div>
      </Field>
      <div className="mt-6">
        <p className="text-sm font-semibold text-slate-900">Mostrar nombre del agente</p>
        <button type="button" role="switch" aria-checked={showName} onClick={() => setShowName(!showName)}
          className={`mt-3 flex h-7 w-12 items-center rounded-full p-0.5 transition ${showName ? "bg-indigo-500" : "bg-slate-200"}`}>
          <span className={`h-6 w-6 rounded-full bg-white shadow transition ${showName ? "translate-x-5" : ""}`} />
        </button>
      </div>
      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-slate-900">Visualización de chats</legend>
        <div className="mt-3 flex flex-wrap gap-6">
          {VIS.map((o) => (
            <label key={o.v} className="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="vis" checked={vis === o.v} onChange={() => setVis(o.v)} className="h-4 w-4 accent-indigo-500" /> {o.l}
            </label>
          ))}
        </div>
      </fieldset>
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={submit} okLabel="Crear" busy={busy} />
    </Modal>
  );
}

function PasswordModal({ agent, onClose, onSaved }: { agent: Agent; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Cambiar contraseña" description={`Nueva contraseña para ${agent.name} (${agent.phone}).`} onClose={onClose}>
      <Field label="Nueva contraseña" required>
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="off" className={inputCls} autoFocus />
      </Field>
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={async () => {
        setBusy(true); const e = await call({ action: "set_password", user_id: agent.id, password }); setBusy(false);
        if (e) return setErr(e); onSaved();
      }} okLabel="Guardar" disabled={password.length < 8} busy={busy} />
    </Modal>
  );
}

export function AgentsClient() {
  const me = useMe();
  const [rows, setRows] = useState<Agent[] | null>(null);
  const [limits, setLimits] = useState<{ agents: number; max: number | null } | null>(null);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{ t: "new" } | { t: "pw"; a: Agent } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const [{ data, error }, { data: ov }] = await Promise.all([
      sb.from("profiles").select("id,name,email,phone,role,created_at,chat_visibility").order("created_at", { ascending: false }),
      sb.rpc("connections_overview"),
    ]);
    if (error) { setErr("No se pudieron cargar los vendedores."); setRows([]); return; }
    setRows(((data ?? []) as Partial<Agent>[]).map((a) => ({ ...(a as Agent), email: a.email ?? "", phone: a.phone ?? "" })));
    if (ov) setLimits({ agents: ov.agents as number, max: (ov.max_agents as number | null) ?? null });
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows ?? []).filter((a) => `${a.name} ${a.phone} ${a.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const { sorted, toggle } = useSort(shown, { key: "created_at", dir: -1 });
  const isAdmin = me?.role === "admin";
  const full = limits?.max != null && limits.agents >= limits.max;

  const remove = async (a: Agent) => {
    if (!confirm(`¿Eliminar a ${a.name}? Ya no podrá entrar y sus chats y deals quedarán sin asignar.`)) return;
    setErr(null); setOk(null);
    const e = await call({ action: "delete", user_id: a.id });
    if (e) return setErr(e);
    setOk(`${a.name} eliminado.`); load();
  };

  return (
    <Page title="Agentes" subtitle="Administra los vendedores de tu empresa. Ellos entran con su número de WhatsApp y contraseña."
      actions={isAdmin ? <button onClick={() => setModal({ t: "new" })} disabled={full} title={full ? "Alcanzaste el límite de vendedores de tu plan" : undefined} className={btnPrimary}><span className="text-lg leading-none">+</span> Añadir vendedor</button> : undefined}>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <SearchBox value={q} onChange={setQ} />
        {limits && (
          <span className={`rounded-md px-3 py-2 text-sm font-medium ${full ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
            Vendedores: {limits.agents}{limits.max != null ? ` / ${limits.max}` : ""}{full ? " · límite alcanzado" : ""}
          </span>
        )}
      </div>
      <Notice text={ok} /><Alert text={err} />
      {me && !isAdmin && <p className="mt-4 text-sm text-slate-500">Solo el administrador de la empresa puede añadir vendedores.</p>}
      <div className="scroll-x">
        <table className={TABLE}>
          <thead><tr>
            <Th onSort={() => toggle("name")}>Nombre</Th><Th>Usuario</Th><Th>Rol</Th><Th>Chats visibles</Th><Th onSort={() => toggle("created_at")}>Fecha de creación</Th>{isAdmin && <th className="w-44" />}
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
            {rows !== null && sorted.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-500">Ningún vendedor coincide con la búsqueda.</td></tr>}
            {sorted.map((a, i) => (
              <tr key={a.id} className={`group ${ROW}`}>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3 text-slate-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: HUES[i % HUES.length] }} aria-hidden>{(a.name || a.phone || a.email || "?").replace("+", "").charAt(0).toUpperCase()}</span>
                    {a.name || "-"}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-500">{a.phone || a.email}</td>
                <td className="px-3 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{a.role === "admin" ? "Administrador" : "Vendedor"}</span></td>
                <td className="px-3 py-3 text-slate-500">{a.role === "admin" ? "Todos" : VIS.find((v) => v.v === a.chat_visibility)?.l}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{dmy(a.created_at)}</td>
                {isAdmin && (
                  <td className="px-3 py-3">
                    {a.role === "agent" && (
                      <span className="flex justify-end gap-3 text-sm font-medium opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <button onClick={() => setModal({ t: "pw", a })} className="text-indigo-600 hover:text-indigo-800">Contraseña</button>
                        <button onClick={() => remove(a)} className="text-red-600 hover:text-red-800">Eliminar</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal?.t === "new" && <AgentModal onClose={() => setModal(null)} onCreated={(p) => { setModal(null); setOk(`Vendedor ${p} creado. Compártele su número y contraseña para entrar.`); load(); }} />}
      {modal?.t === "pw" && <PasswordModal agent={modal.a} onClose={() => setModal(null)} onSaved={() => { setModal(null); setOk("Contraseña actualizada."); }} />}
    </Page>
  );
}
