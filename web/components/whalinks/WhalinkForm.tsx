"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type DeviceOption = { id: string; name: string; phone: string };
export type WhalinkValues = { id: string; name: string; message: string; tag_name: string | null; channel_id: string };

export function PhonePreview({ device, message, media }: { device?: DeviceOption; message: string; media?: { url: string; video: boolean } }) {
  return (
    <div className="mx-auto w-[300px] rounded-[36px] border-[6px] border-white bg-white shadow-xl" aria-label="Vista previa en WhatsApp" role="img">
      <div className="overflow-hidden rounded-[30px]">
        <div className="bg-emerald-700 px-4 pb-3 pt-2 text-white">
          <div className="mb-2 flex justify-between text-[10px]"><span>1:47</span><span>▂▄▆ ▮</span></div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold">W</span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{device?.name ?? "WhatsApp"}</p>
              <p className="truncate text-[10px] opacity-80">{device?.phone ?? "—"}</p>
            </div>
          </div>
        </div>
        <div className="flex h-[320px] flex-col justify-end gap-2 bg-[#efeae2] p-3"
          style={{ backgroundImage: "radial-gradient(#d9d3c7 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
          {message.trim() || media ? (
            <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] text-slate-800 shadow-sm">
              {media && (media.video
                ? <video src={media.url} className="mb-1 max-h-40 w-full rounded" muted />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={media.url} alt="" className="mb-1 max-h-40 w-full rounded object-cover" />)}
              <p className="whitespace-pre-wrap break-words">{message}</p>
              <p className="mt-1 text-[11px] text-slate-400">(ref:······)</p>
              <p className="text-right text-[10px] text-slate-400">1:47 PM ✓</p>
            </div>
          ) : (
            <p className="mb-auto mt-auto text-center text-xs text-slate-400">Escribe el mensaje para ver cómo llegará</p>
          )}
        </div>
        <div className="flex items-center gap-3 bg-[#f0f2f5] px-3 py-2 text-slate-500" aria-hidden>
          <span>☺</span><span className="flex-1 rounded-full bg-white px-3 py-1.5 text-xs text-slate-300">Mensaje</span><span>📎</span><span>📷</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">🎤</span>
        </div>
      </div>
    </div>
  );
}

export function WhalinkForm({ devices, link }: { devices: DeviceOption[]; link?: WhalinkValues }) {
  const router = useRouter();
  const [tab, setTab] = useState<"general" | "advanced">("general");
  const [f, setF] = useState({
    channel: link?.channel_id ?? "", name: link?.name ?? "", message: link?.message ?? "", tag: link?.tag_name ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const device = devices.find((d) => d.id === f.channel);
  const input = "w-full rounded-lg border bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400";
  const label = "mb-2 block text-sm font-semibold";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.channel) { setTab("general"); return setErr("Selecciona un dispositivo."); }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = link
      ? await supabase.rpc("update_whalink", { p_id: link.id, p_name: f.name, p_channel: f.channel, p_message: f.message, p_tag: f.tag })
      : await supabase.rpc("create_whalink", { p_name: f.name, p_channel: f.channel, p_message: f.message, p_tag: f.tag });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/whalinks");
    router.refresh();
  }

  return (
    <form onSubmit={save}>
      <Link href="/whalinks" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">← Regresar</Link>
      <h1 className="mb-6 text-2xl font-semibold">{link ? "Editar link directo" : "Crear link directo"}</h1>

      <div role="tablist" className="mb-8 flex gap-8 border-b">
        {([["general", "Opciones generales"], ["advanced", "Opciones avanzadas"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 pb-3 text-sm font-semibold ${tab === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* las dos pestañas siguen montadas para no perder lo escrito al cambiar */}
          <div hidden={tab !== "general"} className="space-y-6">
            <div>
              <label htmlFor="device" className={label}>Número de WhatsApp<span className="text-red-600">*</span></label>
              {devices.length === 0 ? (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Necesitas un canal con número de teléfono configurado. Conéctalo en Chat.</p>
              ) : (
                <select id="device" required value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className={input}>
                  <option value="" disabled>Selecciona un dispositivo</option>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>)}
                </select>
              )}
            </div>
            <div>
              <label htmlFor="name" className={label}>Nombre<span className="text-red-600">*</span></label>
              <div className="relative">
                <input id="name" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="Escribe el nombre" className={`${input} pr-16`} />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">{f.name.length}/100</span>
              </div>
            </div>
            <div>
              <label htmlFor="msg" className={label}>Mensaje predeterminado<span className="text-red-600">*</span></label>
              <div className="relative">
                <textarea id="msg" required rows={5} maxLength={250} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })}
                  placeholder="Escribe el mensaje" className={`${input} resize-none pr-16`} />
                <span className="pointer-events-none absolute right-4 top-3 text-sm text-slate-500">{f.message.length}/250</span>
              </div>
            </div>
            <p className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-800">
              Mensaje predeterminado que redirecciona al contacto a iniciar una conversación en WhatsApp. Las palabras de este mensaje se
              pueden usar como palabra clave en tus automatizaciones. Al final se añade un código corto <b>(ref:xxxxxx)</b> para atribuir el lead a este link.
            </p>
          </div>

          <div hidden={tab !== "advanced"} className="space-y-6">
            <div>
              <label htmlFor="tag" className={label}>Etiqueta para quien escriba <span className="font-normal text-slate-400">(opcional)</span></label>
              <input id="tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} maxLength={50}
                placeholder="Ej. Desde Instagram" className={input} />
              <p className="mt-2 text-sm text-slate-500">
                Cada persona que te escriba desde este link recibirá esta etiqueta automáticamente, y podrás usarla para
                filtrar chats, lanzar automatizaciones o segmentar envíos.
              </p>
            </div>
          </div>

          {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
          <div className="flex gap-3">
            <Link href="/whalinks" className="rounded-lg border px-6 py-3 text-sm font-semibold text-indigo-700">Cancelar</Link>
            <button disabled={busy || devices.length === 0}
              className="rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50">
              {link ? "Guardar cambios" : "Crear link"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-6">
          <PhonePreview device={device} message={f.message} />
        </div>
      </div>
    </form>
  );
}
