"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Alta de webhooks de entrada (Hotmart, Stripe vía puente, etc.). El secreto se muestra una sola vez.
export function WebhookCard() {
  const [name, setName] = useState("");
  const [hook, setHook] = useState<{ url: string; secret: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { data, error } = await createClient().rpc("create_webhook", { p_name: name });
    if (error) return setErr(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    setHook({ url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/inbound-webhook?hook=${row.id}`, secret: row.secret });
    setName("");
  }

  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="text-sm font-semibold">Webhook de entrada</h2>
      <p className="mb-3 text-xs text-slate-500">Recibe eventos de otras plataformas (compras, registros) y dispáralos como automatizaciones con el disparador «Webhook de entrada».</p>
      <form onSubmit={create} className="flex max-w-md gap-2">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Hotmart)" aria-label="Nombre del webhook"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
        <button className="rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white">Crear</button>
      </form>
      {err && <p className="mt-2 text-sm text-red-600" role="alert">{err}</p>}
      {hook && (
        <div className="mt-3 space-y-1 text-xs">
          <p className="font-medium">URL (POST):</p>
          <code className="block break-all rounded bg-slate-100 p-2">{hook.url}</code>
          <p className="font-medium">Secreto (guárdalo, no se vuelve a mostrar):</p>
          <code className="block break-all rounded bg-slate-100 p-2">{hook.secret}</code>
          <p className="text-slate-500">Firma el cuerpo con HMAC-SHA256 (hex) en el header <b>x-signature</b>, o envía el secreto en <b>x-hotmart-hottok</b>. Cuerpo: {"{ event, phone, name }"}.</p>
        </div>
      )}
    </section>
  );
}
