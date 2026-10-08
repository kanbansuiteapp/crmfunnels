"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnPrimary, Field, inputCls, Modal, ModalActions, Notice, Page, ROW, SearchBox, TABLE, Th, useMe, useSort } from "./kit";

type Agent = { id: string; name: string; email: string; role: string; created_at: string; chat_visibility: string };
const VIS = [{ v: "assigned", l: "Solo Asignados" }, { v: "unassigned", l: "Sin asignar" }, { v: "all", l: "Todos" }];
const dmy = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const HUES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

function AgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [showName, setShowName] = useState(false);
  const [vis, setVis] = useState("assigned");
  const [showPw, setShowPw] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const errs = {
    name: f.name.trim() ? "" : "Nombre es requerido",
    email: !f.email.trim() ? "Email es requerido" : /^\S+@\S+\.\S+$/.test(f.email) ? "" : "Email inválido",
    password: !f.password ? "Contraseña es requerida" : f.password.length < 8 ? "La contraseña necesita 8+ caracteres" : "",
  };
  const bad = (k: keyof typeof errs) => tried && errs[k];

  const submit = async () => {
    setTried(true);
    if (errs.name || errs.email || errs.password) return;
    setBusy(true); setErr(null);
    const { data, error } = await createClient().functions.invoke("admin-users", { body: { ...f, name: f.name.trim(), show_name: showName, chat_visibility: vis } });
    setBusy(false);
    if (error || data?.error) {
      let msg = data?.error as string | undefined;
      if (!msg && error && "context" in error) { try { msg = (await (error as { context: Response }).context.json()).error; } catch { /* sin detalle */ } }
      return setErr(msg ?? "No se pudo crear el agente.");
    }
    onCreated(f.email);
  };
  const ring = (k: keyof typeof errs) => (bad(k) ? "!border-red-400" : "");

  return (
    <Modal title="Crear nuevo agente" description="Registra y configura un nuevo agente encargado de manejar las conversaciones del chat." onClose={onClose} wide>
      <Field label="Nombre" required error={bad("name") || undefined}>
        <input value={f.name} onChange={set("name")} className={`${inputCls} ${ring("name")}`} autoFocus />
      </Field>
      <Field label="Usuario" required error={bad("email") || undefined}>
        <div className="relative">
          <input type="email" value={f.email} onChange={set("email")} placeholder="correo@empresa.com" className={`${inputCls} pr-12 ${ring("email")}`} />
          <button type="button" onClick={() => navigator.clipboard?.writeText(f.email)} aria-label="Copiar usuario" title="Copiar" className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500"><Icon name="copy" size={20} /></button>
        </div>
      </Field>
      <Field label="Contraseña" required error={bad("password") || undefined}>
        <div className="relative">
          <input type={showPw ? "text" : "password"} value={f.password} onChange={set("password")} placeholder="Mínimo 8 caracteres" className={`${inputCls} pr-12 ${ring("password")}`} autoComplete="new-password" />
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

export function AgentsClient() {
  const me = useMe();
  const [rows, setRows] = useState<Agent[] | null>(null);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().from("profiles").select("id,name,email,role,created_at,chat_visibility").order("created_at", { ascending: false });
    if (error) { setErr("No se pudieron cargar los agentes."); setRows([]); return; }
    setRows(((data ?? []) as Agent[]).map((a) => ({ ...a, email: a.email ?? "" })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows ?? []).filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const { sorted, toggle } = useSort(shown, { key: "created_at", dir: -1 });
  const isAdmin = me?.role === "admin";

  return (
    <Page title="Agentes" subtitle="Administra los agentes encargados de responder consultas del chat."
      actions={isAdmin ? <button onClick={() => setModal(true)} className={btnPrimary}><span className="text-lg leading-none">+</span> Añadir agente</button> : undefined}>
      <div className="mt-6"><SearchBox value={q} onChange={setQ} /></div>
      <Notice text={ok} /><Alert text={err} />
      {me && !isAdmin && <p className="mt-4 text-sm text-slate-500">Solo los administradores pueden añadir agentes.</p>}
      <div className="scroll-x">
        <table className={TABLE}>
          <thead><tr>
            <Th onSort={() => toggle("name")}>Nombre</Th><Th onSort={() => toggle("email")}>Usuario</Th><Th>Rol</Th><Th>Chats visibles</Th><Th onSort={() => toggle("created_at")}>Fecha de creación</Th>
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="py-16 text-center text-slate-500">Cargando...</td></tr>}
            {rows !== null && sorted.length === 0 && <tr><td colSpan={5} className="py-16 text-center text-slate-500">Ningún agente coincide con la búsqueda.</td></tr>}
            {sorted.map((a, i) => (
              <tr key={a.id} className={ROW}>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3 text-slate-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: HUES[i % HUES.length] }} aria-hidden>{(a.name || a.email || "?").charAt(0).toUpperCase()}</span>
                    {a.name || "-"}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-500">{a.email}</td>
                <td className="px-3 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{a.role === "admin" ? "Admin" : "Agente"}</span></td>
                <td className="px-3 py-3 text-slate-500">{a.role === "admin" ? "Todos" : VIS.find((v) => v.v === a.chat_visibility)?.l}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{dmy(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <AgentModal onClose={() => setModal(false)} onCreated={(e) => { setModal(false); setOk(`Agente ${e} creado. Compártele su contraseña.`); load(); }} />}
    </Page>
  );
}
