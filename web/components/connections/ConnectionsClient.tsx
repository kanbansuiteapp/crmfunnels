"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { Alert, btnOutline, btnPrimary, Field, inputCls, Modal, ModalActions, Notice, useMe } from "@/components/settings/kit";

type Channel = { id: string; name: string; phone_number: string | null; provider: string; status: string; groups: number };
type Overview = {
  plan_name: string; contacts: number; agents: number; devices: number;
  max_contacts: number | null; max_agents: number | null; max_devices: number | null; channels: Channel[];
};
const nf = new Intl.NumberFormat("es-PE");

async function call(body: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
  const { data, error } = await createClient().functions.invoke("channel-connect", { body });
  if (data?.error) return { data: null, error: data.error as string };
  if (error) {
    let msg: string | undefined;
    try { msg = (await (error as { context: Response }).context.json()).error; } catch { /* sin detalle */ }
    return { data: null, error: msg ?? "No se pudo completar la acción." };
  }
  return { data, error: null };
}

function Stat({ icon, label, value, max }: { icon: "users" | "user" | "phone"; label: string; value: number; max: number | null }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="min-w-[250px] flex-1 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="text-slate-500"><Icon name={icon} size={36} /></span>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-xl font-semibold text-slate-900">{nf.format(value)}{max ? ` / ${nf.format(max)}` : ""}</p>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-lime-500" style={{ width: `${max ? Math.max(pct, 2) : 0}%` }} /></div>
    </div>
  );
}

const STATUS = {
  connected: { label: "Conectado", cls: "text-green-600" },
  idle: { label: "Sin uso", cls: "text-slate-500" },
  off: { label: "Desconectado", cls: "text-red-500" },
};
const statusOf = (c: Channel) => (c.status === "connected" ? STATUS.connected : c.phone_number ? STATUS.off : STATUS.idle);

// ── conectar: elegir tipo → QR (Messenger) o info de Meta (Business)
function ConnectFlow({ channel, onClose, onConnected }: { channel: Channel; onClose: () => void; onConnected: () => void }) {
  const [step, setStep] = useState<"pick" | "qr" | "meta">("pick");
  const [kind, setKind] = useState<"messenger" | "business" | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const getQr = useCallback(async () => {
    setLoading(true); setErr(null);
    const r = await call({ action: "qr", channel_id: channel.id });
    if (!alive.current) return;
    setLoading(false);
    if (r.error) return setErr(r.error);
    setQr(r.data.qr ?? null);
  }, [channel.id]);

  useEffect(() => {
    if (step !== "qr") return;
    getQr();
    const poll = setInterval(async () => {
      const r = await call({ action: "status", channel_id: channel.id });
      if (alive.current && r.data?.status === "connected") { clearInterval(poll); onConnected(); }
    }, 3000);
    const refresh = setInterval(getQr, 40_000); // el QR de WhatsApp caduca
    return () => { clearInterval(poll); clearInterval(refresh); };
  }, [step, channel.id, getQr, onConnected]);

  const choice = (k: "messenger" | "business", title: string, g: string) => (
    <button onClick={() => setKind(k)} aria-pressed={kind === k}
      className={`flex w-40 flex-col items-center gap-3 rounded-xl border p-4 text-sm font-semibold text-slate-700 ${kind === k ? "border-green-400 bg-green-50" : "border-slate-100 hover:border-slate-300"}`}>
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-3xl font-bold text-white" aria-hidden>{g}</span>
      {title}
    </button>
  );

  if (step === "pick") return (
    <Modal title="Conectar número" description="Selecciona la opción que mejor se adapte a tus necesidades." onClose={onClose}>
      <div className="flex justify-center gap-5">
        {choice("messenger", "WhatsApp Messenger", "✆")}
        {choice("business", "WhatsApp Business", "B")}
      </div>
      <ModalActions onCancel={onClose} onOk={() => setStep(kind === "messenger" ? "qr" : "meta")} okLabel="Continuar" disabled={!kind} />
    </Modal>
  );

  if (step === "meta") return (
    <Modal title="Números extras y API" onClose={onClose}>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Información esencial</p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
        <li>No utilices un número personal para esta acción porque perderás todos tus datos.</li>
        <li>Se recomienda emplear un número nuevo que puedas convertir en un número de WhatsApp API.</li>
        <li>La aplicación de WhatsApp en el celular y la versión web dejarán de funcionar con este número después de la conexión.</li>
      </ul>
      <p className="mt-4 text-sm text-indigo-600">El asistente de Facebook se abrirá en una nueva pestaña; sigue los pasos para conectar tu número de WhatsApp API.</p>
      <Notice text="La conexión con Meta aún no está configurada en esta cuenta. Por ahora conecta tu número con WhatsApp Messenger (QR)." />
      <div className="mt-8 grid grid-cols-2 gap-4">
        <button onClick={onClose} className={btnOutline}>Cancelar</button>
        <button disabled className={btnPrimary}>Continuar en Facebook</button>
      </div>
    </Modal>
  );

  return (
    <Modal title="Escanea el código QR" description="En tu celular abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escanea este código." onClose={onClose}>
      <div className="flex min-h-64 items-center justify-center">
        {loading && !qr ? <p className="text-slate-500">Generando código...</p>
          : qr ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="Código QR de WhatsApp" className="h-64 w-64" />
          : <p className="text-slate-500">No hay código disponible.</p>}
      </div>
      <Alert text={err} />
      <p className="mt-3 text-center text-xs text-slate-500">El código se renueva solo cada 40 segundos. Esta ventana se cierra cuando el número queda conectado.</p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <button onClick={onClose} className={btnOutline}>Cancelar</button>
        <button onClick={getQr} disabled={loading} className={btnPrimary}>Generar otro código</button>
      </div>
    </Modal>
  );
}

function NameModal({ title, initial, okLabel, onClose, onSave }: { title: string; initial: string; okLabel: string; onClose: () => void; onSave: (n: string) => Promise<string | null> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Nombre del dispositivo" required counter={`${name.length}/60`}>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej. Soporte 1" className={inputCls} autoFocus />
      </Field>
      <Alert text={err} />
      <ModalActions onCancel={onClose} onOk={async () => { setBusy(true); const e = await onSave(name.trim()); setBusy(false); if (e) setErr(e); }} okLabel={okLabel} disabled={!name.trim()} busy={busy} />
    </Modal>
  );
}

export function ConnectionsClient() {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [modal, setModal] = useState<{ t: "add" } | { t: "rename" | "connect"; c: Channel } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("connections_overview");
    if (error) { setErr("No se pudieron cargar las conexiones."); return; }
    setOv(data as Overview);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const act = async (body: Record<string, unknown>, ok?: string) => {
    setErr(null); setNote(null);
    const r = await call(body);
    if (r.error) { setErr(r.error); return false; }
    if (ok) setNote(ok);
    await load();
    return true;
  };

  return (
    <main className="w-full p-6 md:px-10 md:py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Detalles del plan</h1>
      <div className="mt-5 flex flex-wrap items-center gap-8">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">{ov?.plan_name ?? "Plan"} <span className="text-green-500" aria-hidden>✓</span></p>
        </div>
        <div className="flex flex-1 flex-wrap gap-5">
          <Stat icon="users" label="Contactos" value={ov?.contacts ?? 0} max={ov?.max_contacts ?? null} />
          <Stat icon="user" label="Total de agentes" value={ov?.agents ?? 0} max={ov?.max_agents ?? null} />
          <Stat icon="phone" label="Dispositivos" value={ov?.devices ?? 0} max={ov?.max_devices ?? null} />
        </div>
      </div>
      <hr className="my-8 border-slate-100" />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">Conexiones</h2>
        {isAdmin && <button onClick={() => setModal({ t: "add" })} className={btnPrimary}><span className="text-lg leading-none">+</span> Añadir dispositivo</button>}
      </div>
      <Notice text={note} /><Alert text={err} />

      {ov === null ? <p className="mt-16 text-center text-slate-500">Cargando...</p>
        : ov.channels.length === 0 ? <p className="mt-16 text-center text-slate-500">Aún no tienes dispositivos. {isAdmin ? "Usa “Añadir dispositivo” para crear el primero." : "Pídele a un administrador que añada uno."}</p>
        : (
          <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
            {ov.channels.map((c) => {
              const st = statusOf(c);
              return (
                <section key={c.id} className="relative flex min-h-[340px] flex-col items-center rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" aria-label={c.name}>
                  <div className="flex w-full items-center justify-between text-sm text-slate-500">
                    <span className="flex items-center gap-1.5"><Icon name="users" size={18} /> {c.groups}</span>
                    {c.provider === "meta" && <span title="API oficial de Meta" className="text-blue-500">∞</span>}
                    {isAdmin && (
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id); }} aria-label={`Opciones de ${c.name}`} aria-expanded={menu === c.id} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Icon name="more" size={20} className="rotate-90" /></button>
                        {menu === c.id && (
                          <ul className="absolute right-0 z-10 mt-1 w-44 rounded-lg border bg-white py-1 text-sm shadow-lg" onClick={(e) => e.stopPropagation()}>
                            <li><button onClick={() => { setMenu(null); setModal({ t: "rename", c }); }} className="w-full px-4 py-2 text-left hover:bg-slate-50">Cambiar nombre</button></li>
                            {c.status === "connected" && <li><button onClick={() => { setMenu(null); if (confirm(`¿Desconectar ${c.name}? Dejará de recibir y enviar mensajes.`)) act({ action: "logout", channel_id: c.id }, "Número desconectado."); }} className="w-full px-4 py-2 text-left hover:bg-slate-50">Desconectar</button></li>}
                            <li><button onClick={() => { setMenu(null); if (confirm(`¿Eliminar ${c.name}? Se borrará el dispositivo y sus conversaciones.`)) act({ action: "remove", channel_id: c.id }, "Dispositivo eliminado."); }} className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50">Eliminar</button></li>
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="mt-1 flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-800 bg-slate-50 text-slate-700" aria-hidden><Icon name="phone" size={28} /></span>
                  <p className="mt-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <span className="max-w-[170px] truncate" title={c.name}>{c.name}</span>
                    {isAdmin && <button onClick={() => setModal({ t: "rename", c })} aria-label={`Cambiar nombre de ${c.name}`} className="text-indigo-500"><Icon name="pencil" size={16} /></button>}
                  </p>
                  <p className="mt-1 text-sm text-indigo-600">{c.phone_number ?? "Sin registro"}</p>
                  <p className="mt-6 text-sm text-slate-500">Estado</p>
                  <span className={`mt-1 rounded bg-slate-50 px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  <div className="mt-auto pt-6">
                    {c.status === "connected"
                      ? <span className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700">Número conectado</span>
                      : <button disabled={!isAdmin} onClick={() => setModal({ t: "connect", c })} className="inline-flex items-center gap-2 rounded-md bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Icon name="phone" size={18} /> Conectar número</button>}
                  </div>
                </section>
              );
            })}
          </div>
        )}

      {modal?.t === "add" && <NameModal title="Añadir dispositivo" initial="" okLabel="Añadir" onClose={() => setModal(null)} onSave={async (n) => { const r = await call({ action: "create", name: n }); if (r.error) return r.error; setModal(null); await load(); return null; }} />}
      {modal?.t === "rename" && <NameModal title="Cambiar nombre" initial={modal.c.name} okLabel="Guardar" onClose={() => setModal(null)} onSave={async (n) => { const r = await call({ action: "rename", channel_id: modal.c.id, name: n }); if (r.error) return r.error; setModal(null); await load(); return null; }} />}
      {modal?.t === "connect" && <ConnectFlow channel={modal.c} onClose={() => setModal(null)} onConnected={() => { setModal(null); setNote("Número conectado."); load(); }} />}
    </main>
  );
}
