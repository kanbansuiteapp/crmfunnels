"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StepList } from "./StepList";
import { TRIGGERS, STEP_LABELS, type Automation, type Folder, type RunWithLog, type Step, type Trigger } from "./types";

const blank = (): Automation => ({
  id: null, name: "", trigger_type: "incoming_message", conditions: {}, actions_tree_json: { steps: [] }, enabled: true, folder_id: null,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "Completada", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Falló", cls: "bg-red-100 text-red-800" },
  waiting: { label: "En espera", cls: "bg-amber-100 text-amber-800" },
  running: { label: "Ejecutando", cls: "bg-sky-100 text-sky-800" },
};

export function AutomationEditor({
  automation, folders, runs, isAdmin,
}: { automation?: Automation; folders: Folder[]; runs: RunWithLog[]; isAdmin: boolean }) {
  const router = useRouter();
  const [a, setA] = useState<Automation>(automation ?? blank());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const t = TRIGGERS[a.trigger_type];
  const input = "w-full rounded-lg border bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400";
  const label = "mb-2 block text-sm font-semibold";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    // el valor de horas se guarda como número; las condiciones vacías se descartan
    const conditions = Object.fromEntries(
      Object.entries(a.conditions).filter(([, v]) => String(v).trim() !== "").map(([k, v]) => [k, k === "hours" ? Number(v) : v]),
    );
    const { data, error } = await supabase.rpc("save_automation", {
      p_id: a.id, p_name: a.name, p_trigger: a.trigger_type, p_conditions: conditions,
      p_tree: a.actions_tree_json, p_enabled: a.enabled,
    });
    if (!error) {
      const { error: fErr } = await supabase.rpc("set_automation_folder", { p_id: (a.id ?? data) as string, p_folder: a.folder_id });
      if (fErr) { setBusy(false); return setErr(fErr.message); }
    }
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/automations");
    router.refresh();
  }

  async function remove() {
    if (!a.id || !confirm("¿Eliminar esta automatización? No se puede deshacer.")) return;
    const { error } = await createClient().from("automations").delete().eq("id", a.id);
    if (error) return setErr(error.message);
    router.push("/automations");
    router.refresh();
  }

  const describe = (s: NonNullable<RunWithLog["log"]>[number]) =>
    `${s.ok === false ? "✗" : "✓"} ${STEP_LABELS[s.step as Step["type"]] ?? s.step ?? "Paso"}${s.detail ? ` — ${s.detail}` : ""}${s.error ? ` — ${s.error}` : ""}${s.step === "condition" ? ` — ${s.result ? "se cumple" : "no se cumple"}` : ""}${s.step === "wait" ? ` — ${s.minutes} min` : ""}`;

  return (
    <div>
      <Link href="/automations" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600">← Regresar</Link>
      <h1 className="mb-6 text-2xl font-semibold">{automation ? automation.name : "Crear automatización"}</h1>

      <form onSubmit={save} className="max-w-3xl space-y-6">
        <fieldset disabled={!isAdmin} className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="aname" className={label}>Nombre<span className="text-red-600">*</span></label>
              <input id="aname" required maxLength={100} value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Ej. Bienvenida a interesados" className={input} />
            </div>
            <label className="mt-9 flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-indigo-600" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} />
              Activa
            </label>
          </div>

          <div>
            <label htmlFor="afolder" className={label}>Carpeta</label>
            <select id="afolder" value={a.folder_id ?? ""} onChange={(e) => setA({ ...a, folder_id: e.target.value || null })} className={input}>
              <option value="">Sin carpeta</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div>
            <p className={label}>Cuando…</p>
            <div className="flex gap-3">
              <select value={a.trigger_type} aria-label="Disparador" className={`${input} max-w-xs`}
                onChange={(e) => setA({ ...a, trigger_type: e.target.value as Trigger, conditions: {} })}>
                {(Object.keys(TRIGGERS) as Trigger[]).map((k) => <option key={k} value={k}>{TRIGGERS[k].label}</option>)}
              </select>
              <input value={String(a.conditions[t.field] ?? "")} placeholder={t.placeholder} aria-label="Condición del disparador"
                type={a.trigger_type === "inactivity" ? "number" : "text"} min={1}
                onChange={(e) => setA({ ...a, conditions: { [t.field]: e.target.value } })} className={input} />
            </div>
          </div>

          <div>
            <p className={label}>Entonces…</p>
            <StepList steps={a.actions_tree_json.steps} onChange={(steps) => setA({ ...a, actions_tree_json: { steps } })} />
          </div>
        </fieldset>

        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <div className="flex gap-3">
          <Link href="/automations" className="rounded-lg border px-6 py-3 text-sm font-semibold text-indigo-700">Cancelar</Link>
          {isAdmin && (
            <button disabled={busy} className="rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50">
              {automation ? "Guardar cambios" : "Crear automatización"}
            </button>
          )}
          {isAdmin && automation && (
            <button type="button" onClick={remove} className="ml-auto rounded-lg border border-red-300 px-5 py-3 text-sm font-semibold text-red-600">Eliminar</button>
          )}
        </div>
      </form>

      {automation && (
        <section className="mt-10 max-w-3xl">
          <h2 className="mb-3 text-sm font-semibold text-indigo-600">Ejecuciones recientes</h2>
          <ul className="divide-y rounded-xl border bg-white text-sm">
            {runs.length === 0 && <li className="p-5 text-slate-500">Todavía no se ha ejecutado.</li>}
            {runs.map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpenRun(openRun === r.id ? null : r.id)} aria-expanded={openRun === r.id}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50">
                  <span className="text-slate-600">{new Date(r.created_at).toLocaleString("es")}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${(STATUS[r.status] ?? STATUS.running).cls}`}>{(STATUS[r.status] ?? STATUS.running).label}</span>
                </button>
                {openRun === r.id && (
                  <ol className="space-y-1 bg-slate-50 px-5 py-3 text-xs text-slate-700">
                    {(r.log ?? []).length === 0 && <li>Sin pasos registrados.</li>}
                    {(r.log ?? []).map((s, i) => <li key={i}>{describe(s)}</li>)}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
