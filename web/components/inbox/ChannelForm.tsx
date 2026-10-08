"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Alta de canal Evolution API; muestra la URL del webhook una sola vez
export function ChannelForm({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ name: "", api_url: "", api_key: "", instance: "" });
  const [hook, setHook] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await createClient().rpc("create_channel", {
      p_name: f.name, p_api_url: f.api_url, p_api_key: f.api_key, p_instance: f.instance,
    });
    if (error) return setMsg(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    setHook(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/wa-webhook?channel=${row.id}&secret=${row.webhook_secret}`
    );
    onCreated();
  }

  const input = "rounded border px-3 py-2 text-sm";
  if (hook)
    return (
      <div className="max-w-xl rounded-xl border bg-white p-5">
        <p className="mb-2 text-sm font-medium">Canal creado. Configura este webhook en Evolution (evento MESSAGES_UPSERT):</p>
        <code className="block break-all rounded bg-slate-100 p-2 text-xs">{hook}</code>
        <p className="mt-2 text-xs text-slate-500">Guárdala: contiene el secreto y no se vuelve a mostrar.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Conectar canal (Evolution API)</h2>
      <input required name="channel-name" autoComplete="off" placeholder="Nombre" value={f.name} onChange={set("name")} className={input} />
      <input name="evo-url" type="url" autoComplete="off" placeholder="URL de Evolution (https://…)" value={f.api_url} onChange={set("api_url")} className={input} />
      <input name="evo-key" type="password" autoComplete="new-password" placeholder="API key de la instancia" value={f.api_key} onChange={set("api_key")} className={input} />
      <input name="evo-instance" autoComplete="off" placeholder="Nombre de instancia" value={f.instance} onChange={set("instance")} className={input} />
      {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
      <button className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white">Crear canal</button>
    </form>
  );
}
