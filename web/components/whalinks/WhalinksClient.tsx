"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Whalink = {
  id: string; name: string; slug: string; message: string; tag_name: string | null;
  clicks: number; leads: number; channel: { name: string } | null;
};

export function WhalinksClient({
  links, channels, isAdmin,
}: { links: Whalink[]; channels: { id: string; name: string }[]; isAdmin: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", channel: channels[0]?.id ?? "", message: "", tag: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const urlOf = (slug: string) => `${window.location.origin}/w/${slug}`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await createClient().rpc("create_whalink", {
      p_name: f.name, p_channel: f.channel, p_message: f.message, p_tag: f.tag,
    });
    if (error) return setMsg(error.message);
    setF({ ...f, name: "", message: "", tag: "" });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este enlace? Dejará de funcionar.")) return;
    const { error } = await createClient().from("whalinks").delete().eq("id", id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(urlOf(slug));
      setCopied(slug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setMsg("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {isAdmin && (
        <form onSubmit={create} className="h-fit space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Nuevo enlace</h2>
          {channels.length === 0 ? (
            <p className="text-sm text-slate-500">Necesitas un canal con número de teléfono configurado.</p>
          ) : (
            <>
              <input required placeholder="Nombre (ej. Instagram bio)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
              <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className={input}>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <textarea rows={3} maxLength={500} placeholder="Mensaje inicial (ej. Hola, quiero información)" value={f.message}
                onChange={(e) => setF({ ...f, message: e.target.value })} className={input} />
              <input placeholder="Etiqueta para quien escriba (opcional)" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} className={input} />
              <p className="text-xs text-slate-500">
                Al final del mensaje se añade un código corto <b>(ref:xxxxxx)</b> para saber que el lead vino de este enlace. Si el cliente lo borra, el clic cuenta pero el lead no se atribuye.
              </p>
              <button className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Crear enlace</button>
            </>
          )}
          {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
        </form>
      )}

      <section className={isAdmin ? "" : "lg:col-span-2"}>
        {!isAdmin && msg && <p className="mb-2 text-sm text-red-600" role="alert">{msg}</p>}
        <ul className="space-y-3">
          {links.length === 0 && <li className="rounded-xl border bg-white p-6 text-sm text-slate-500">Aún no hay enlaces.</li>}
          {links.map((l) => (
            <li key={l.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-slate-500">{l.channel?.name}{l.tag_name ? ` · etiqueta: ${l.tag_name}` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-4 text-center text-sm">
                  <div><p className="text-xl font-semibold">{l.clicks}</p><p className="text-xs text-slate-500">clics</p></div>
                  <div><p className="text-xl font-semibold">{l.leads}</p><p className="text-xs text-slate-500">leads</p></div>
                </div>
              </div>
              {l.message && <p className="mt-2 truncate text-sm text-slate-600">“{l.message}”</p>}
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">/w/{l.slug}</code>
                <button onClick={() => copy(l.slug)} className="rounded-lg border px-3 py-1 text-xs">
                  {copied === l.slug ? "¡Copiado!" : "Copiar enlace"}
                </button>
                {isAdmin && <button aria-label={`Eliminar ${l.name}`} onClick={() => remove(l.id)}>🗑</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
