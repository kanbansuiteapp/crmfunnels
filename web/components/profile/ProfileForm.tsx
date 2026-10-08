"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Values = { name: string; whatsapp: string; timezone: string };

const FALLBACK_TZ = [
  "America/Lima", "America/Bogota", "America/Mexico_City", "America/Argentina/Buenos_Aires",
  "America/Santiago", "America/Caracas", "America/New_York", "Europe/Madrid", "UTC",
];

export function ProfileForm({ email, role, initial }: { email: string; role: string; initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const zones = useMemo(() => {
    let list: string[] = FALLBACK_TZ;
    try {
      list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch { /* navegador sin soporte: lista corta */ }
    return list.includes(initial.timezone) ? list : [initial.timezone, ...list];
  }, [initial.timezone]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("update_my_profile", {
      p_name: v.name, p_whatsapp: v.whatsapp, p_timezone: v.timezone,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Cambios guardados." });
    router.refresh(); // actualiza el nombre del menú superior
  }

  const input = "w-full rounded-lg border px-3 py-2.5 text-sm";
  const label = "mb-1 block text-sm font-medium";
  return (
    <form onSubmit={save} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={label}>Nombre<span className="text-red-600">*</span></label>
          <input id="name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="email" className={label}>Correo electrónico</label>
          <input id="email" value={email} disabled className={`${input} bg-slate-50 text-slate-500`} />
        </div>
        <div>
          <label htmlFor="wa" className={label}>WhatsApp personal</label>
          <input id="wa" type="tel" inputMode="tel" placeholder="+51912345678" value={v.whatsapp}
            onChange={(e) => setV({ ...v, whatsapp: e.target.value })} className={input} />
          <p className="mt-1 text-xs text-slate-500">Con código de país, ej. +51… Se usará para avisos.</p>
        </div>
        <div>
          <label htmlFor="tz" className={label}>Zona horaria</label>
          <select id="tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} className={input}>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Define cómo se agrupan los días en tu dashboard.</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">Rol: {role === "admin" ? "Administrador" : "Agente"}</p>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="alert">{msg.text}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => { setV(initial); setMsg(null); }}
          className="rounded-lg border px-5 py-2.5 text-sm font-medium text-sky-700">Cancelar</button>
        <button disabled={busy} className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          Guardar cambios
        </button>
      </div>
    </form>
  );
}
