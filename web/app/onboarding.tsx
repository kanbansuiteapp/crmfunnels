"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function Onboarding() {
  const router = useRouter();
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient().rpc("bootstrap_organization", {
      p_org_name: org,
      p_name: name,
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
    } else router.push(`/pipelines/${data}`);
  }

  return (
    <main className="mx-auto mt-24 w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold">Crea tu organización</h1>
      <p className="mb-4 text-sm text-slate-500">Se creará un pipeline de ventas listo para usar.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input required placeholder="Nombre de la empresa" value={org}
          onChange={(e) => setOrg(e.target.value)} className="rounded border px-3 py-2 text-sm" />
        <input placeholder="Tu nombre" value={name}
          onChange={(e) => setName(e.target.value)} className="rounded border px-3 py-2 text-sm" />
        <button disabled={busy} className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          Continuar
        </button>
        {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
      </form>
    </main>
  );
}
