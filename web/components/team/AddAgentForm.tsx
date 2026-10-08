"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AddAgentForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient().functions.invoke("admin-users", { body: f });
    setBusy(false);
    if (error || data?.error) return setMsg({ ok: false, text: data?.error ?? "No se pudo crear el agente." });
    setMsg({ ok: true, text: `Agente ${f.email} creado. Compártele su contraseña.` });
    setF({ name: "", email: "", password: "" });
    router.refresh();
  }

  const input = "rounded border px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Agregar agente</h2>
      <input placeholder="Nombre" value={f.name} onChange={set("name")} className={input} />
      <input required type="email" placeholder="Correo" value={f.email} onChange={set("email")} className={input} />
      <input required type="password" minLength={8} placeholder="Contraseña (mín. 8)" value={f.password} onChange={set("password")} className={input} />
      <button disabled={busy} className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
        Crear agente
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="alert">{msg.text}</p>}
    </form>
  );
}
