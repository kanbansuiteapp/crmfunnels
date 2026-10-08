"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
import { COUNTRIES, splitPhone } from "@/lib/countries";

type Values = { name: string; whatsapp: string; timezone: string };

const FALLBACK_TZ = [
  "America/Lima", "America/Bogota", "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "America/Santiago", "America/Caracas", "America/New_York", "Europe/Madrid", "UTC",
];

export function ProfileForm({ email, role, initial }: { email: string; role: string; initial: Values }) {
  const router = useRouter();
  const start = useMemo(() => splitPhone(initial.whatsapp), [initial.whatsapp]);
  const [name, setName] = useState(initial.name);
  const [tz, setTz] = useState(initial.timezone);
  const [cc, setCc] = useState(start.cc);
  const [national, setNational] = useState(start.national);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const zones = useMemo(() => {
    let list: string[] = FALLBACK_TZ;
    try {
      list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch { /* navegador sin soporte: lista corta */ }
    return list.includes(initial.timezone) ? list : [initial.timezone, ...list];
  }, [initial.timezone]);

  const country = COUNTRIES.find((c) => c[0] === cc)!;
  const nationalDigits = national.replace(/\D/g, "");
  const whatsapp = nationalDigits ? `+${country[2]}${nationalDigits}` : "";
  const phoneErr = nationalDigits && !/^\+[0-9]{6,15}$/.test(whatsapp) ? "Número inválido. Revisa el código de país y los dígitos." : "";
  const nameErr = name.trim() ? "" : "El nombre es obligatorio.";
  const dirty = name !== initial.name || tz !== initial.timezone || whatsapp !== (initial.whatsapp ? `+${initial.whatsapp.replace(/\D/g, "")}` : "");

  const reset = () => { setName(initial.name); setTz(initial.timezone); setCc(start.cc); setNational(start.national); setMsg(null); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nameErr || phoneErr) return;
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("update_my_profile", { p_name: name.trim(), p_whatsapp: whatsapp, p_timezone: tz });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Cambios guardados." });
    router.refresh(); // actualiza el nombre del menú superior
  }

  const input = "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400";
  const label = "mb-2 block text-sm font-semibold text-slate-900";
  const initials = (name.trim() || email).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  return (
    <form onSubmit={save} className="flex min-h-[calc(100vh-9rem)] flex-col">
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-2xl font-semibold text-indigo-700" aria-hidden>{initials}</span>
        <div className="min-w-0">
          <p className="truncate text-xl font-medium text-slate-900">{initial.name || email}</p>
          <p className="flex items-center gap-2 text-sm font-medium text-indigo-600">
            <span className="truncate">{email}</span>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="Copiar correo" title={copied ? "Copiado" : "Copiar"}>
              <Icon name="copy" size={18} />
            </button>
          </p>
        </div>
      </div>

      <div className="mt-10 grid max-w-5xl gap-x-12 gap-y-7 md:grid-cols-2">
        <div>
          <label htmlFor="name" className={label}>Nombre<span className="text-red-500">*</span></label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={`${input} ${nameErr ? "!border-red-400" : ""}`} />
        </div>
        <div>
          <label htmlFor="email" className={label}>Correo electrónico</label>
          <input id="email" value={email} disabled className={`${input} bg-slate-50 text-slate-500`} />
        </div>
        <div>
          <label htmlFor="wa" className={label}>WhatsApp personal</label>
          <div className={`flex overflow-hidden rounded-md border bg-white focus-within:border-indigo-400 ${phoneErr ? "border-red-400" : "border-slate-200"}`}>
            <div className="relative flex items-center border-r border-slate-200 bg-slate-50 px-3">
              <span className="pointer-events-none text-lg leading-none" aria-hidden>{country[3]}</span>
              <span className="pointer-events-none ml-1 text-[10px] text-slate-500" aria-hidden>▾</span>
              <select aria-label="País del número" value={cc} onChange={(e) => setCc(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
                {COUNTRIES.map((c) => <option key={c[0]} value={c[0]}>{c[3]} {c[1]} (+{c[2]})</option>)}
              </select>
            </div>
            <span className="flex items-center pl-3 text-sm text-slate-500">+{country[2]}</span>
            <input id="wa" type="tel" inputMode="tel" placeholder="912345678" value={national} onChange={(e) => setNational(e.target.value.replace(/[^\d\s()-]/g, ""))} className="w-full px-2 py-3 text-sm outline-none" />
          </div>
          {phoneErr
            ? <p role="alert" className="mt-1 text-sm text-red-600">{phoneErr}</p>
            : <p className="mt-1 text-xs text-slate-500">A este número se enviarán las alertas provenientes de WhatsApp.</p>}
        </div>
        <div>
          <label htmlFor="tz" className={label}>Zona horaria</label>
          <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)} className={input}>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Define cómo se agrupan los días en tu dashboard.</p>
        </div>
      </div>
      <p className="mt-6 text-xs text-slate-500">Rol: {role === "admin" ? "Administrador" : "Agente"}</p>

      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="alert">{msg.text}</p>}
      <div className="sticky bottom-0 -mx-6 mt-auto flex justify-end gap-4 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
        <button type="button" onClick={reset} className="min-w-40 rounded-md border border-indigo-500 bg-white px-5 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">Cancelar</button>
        <button disabled={busy || !dirty || !!nameErr || !!phoneErr} className="min-w-40 rounded-md bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
