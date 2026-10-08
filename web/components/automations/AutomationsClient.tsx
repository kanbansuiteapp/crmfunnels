"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StepList } from "./StepList";
import { TRIGGERS, type Automation, type Run, type Trigger } from "./types";

const empty = (): Automation => ({
  id: null, name: "", trigger_type: "incoming_message", conditions: {},
  actions_tree_json: { steps: [] }, enabled: true,
});

export function AutomationsClient({
  automations, runs, isAdmin,
}: { automations: Automation[]; runs: Run[]; isAdmin: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Automation | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hook, setHook] = useState<{ url: string; secret: string } | null>(null);
  const [hookName, setHookName] = useState("");

  async function save(a: Automation) {
    setMsg(null);
    // el valor de la condición del disparador numérico se guarda como número
    const conditions = Object.fromEntries(
      Object.entries(a.conditions)
        .filter(([, v]) => String(v).trim() !== "")
        .map(([k, v]) => [k, k === "hours" ? Number(v) : v])
    );
    const { error } = await createClient().rpc("save_automation", {
      p_id: a.id, p_name: a.name, p_trigger: a.trigger_type, p_conditions: conditions,
      p_tree: a.actions_tree_json, p_enabled: a.enabled,
    });
    if (error) return setMsg(error.message);
    setDraft(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta automatización?")) return;
    const { error } = await createClient().from("automations").delete().eq("id", id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function createHook(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await createClient().rpc("create_webhook", { p_name: hookName });
    if (error) return setMsg(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    setHook({ url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/inbound-webhook?hook=${row.id}`, secret: row.secret });
    setHookName("");
  }

  const input = "rounded border px-3 py-2 text-sm";
  const t = draft ? TRIGGERS[draft.trigger_type] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        {isAdmin && (
          <button onClick={() => setDraft(empty())} className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white">
            + Nueva automatización
          </button>
        )}
        <ul className="divide-y rounded-xl border bg-white">
          {automations.length === 0 && <li className="p-4 text-sm text-slate-500">Aún no hay automatizaciones.</li>}
          {automations.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => setDraft(structuredClone(a))}>
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-slate-500">{TRIGGERS[a.trigger_type].label}{a.enabled ? "" : " · pausada"}</p>
              </button>
              {isAdmin && <button aria-label={`Eliminar ${a.name}`} onClick={() => remove(a.id!)}>🗑</button>}
            </li>
          ))}
        </ul>

        {isAdmin && (
          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">Webhook de entrada</h2>
            <form onSubmit={createHook} className="flex gap-2">
              <input required value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="Nombre (ej. Hotmart)" className={`${input} min-w-0 flex-1`} />
              <button className="rounded bg-sky-600 px-3 text-sm text-white">Crear</button>
            </form>
            {hook && (
              <div className="mt-3 space-y-1 text-xs">
                <p className="font-medium">URL (POST):</p>
                <code className="block break-all rounded bg-slate-100 p-2">{hook.url}</code>
                <p className="font-medium">Secreto (guárdalo, no se vuelve a mostrar):</p>
                <code className="block break-all rounded bg-slate-100 p-2">{hook.secret}</code>
                <p className="text-slate-500">Firma el cuerpo con HMAC-SHA256 (hex) en el header <b>x-signature</b>, o envía el secreto en <b>x-hotmart-hottok</b>. Cuerpo: {"{ event, phone, name }"}.</p>
              </div>
            )}
          </div>
        )}
      </aside>

      <section>
        {draft && t ? (
          <form
            onSubmit={(e) => { e.preventDefault(); save(draft); }}
            className="space-y-4 rounded-xl border bg-white p-5"
          >
            <div className="flex gap-3">
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre" className={`${input} flex-1`} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                Activa
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Cuando…</p>
              <div className="flex gap-2">
                <select value={draft.trigger_type} className={input}
                  onChange={(e) => setDraft({ ...draft, trigger_type: e.target.value as Trigger, conditions: {} })}>
                  {(Object.keys(TRIGGERS) as Trigger[]).map((k) => <option key={k} value={k}>{TRIGGERS[k].label}</option>)}
                </select>
                <input value={String(draft.conditions[t.field] ?? "")} placeholder={t.placeholder}
                    type={draft.trigger_type === "inactivity" ? "number" : "text"} min={1}
                    onChange={(e) => setDraft({ ...draft, conditions: { [t.field]: e.target.value } })}
                    className={`${input} flex-1`} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Entonces…</p>
              <StepList
                steps={draft.actions_tree_json.steps}
                onChange={(steps) => setDraft({ ...draft, actions_tree_json: { steps } })}
              />
            </div>
            {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
            <div className="flex gap-2">
              <button className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white">Guardar</button>
              <button type="button" onClick={() => setDraft(null)} className="rounded px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        ) : (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Últimas ejecuciones</h2>
            {msg && <p className="mb-2 text-sm text-red-600" role="alert">{msg}</p>}
            <ul className="divide-y rounded-xl border bg-white text-sm">
              {runs.length === 0 && <li className="p-4 text-slate-500">Sin ejecuciones todavía.</li>}
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2">
                  <span>{r.automation?.name ?? "—"}</span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    {new Date(r.created_at).toLocaleString()}
                    <span className={`rounded px-2 py-0.5 ${
                      r.status === "done" ? "bg-emerald-100 text-emerald-800"
                      : r.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {r.status === "done" ? "completada" : r.status === "failed" ? "falló" : r.status === "waiting" ? "en espera" : "ejecutando"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
