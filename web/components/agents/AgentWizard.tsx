"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MODELS, type Agent } from "./types";

type Industry = { id: string; label: string; sub: string; icon: string; focus: string; best: string };
const INDUSTRIES: Industry[] = [
  { id: "restaurante", label: "Restaurante", sub: "Perfecto para reservaciones, menú y horarios", icon: "🍴", best: "Agendar Citas",
    focus: "Informa el menú, precios, horarios y ubicación, y toma reservaciones (fecha, hora y número de personas)." },
  { id: "clinica", label: "Clínica / Consultorio", sub: "Ideal para agendar citas médicas", icon: "🩺", best: "Agendar Citas",
    focus: "Informa especialidades, precios de consulta, horarios y seguros aceptados, y agenda citas. No des diagnósticos médicos." },
  { id: "tienda", label: "Tienda / E-commerce", sub: "Para ventas y atención al cliente", icon: "🛍️", best: "Ventas",
    focus: "Informa catálogo, precios, existencias, métodos de pago y tiempos de envío, y ayuda a completar la compra." },
  { id: "inmobiliaria", label: "Inmobiliaria", sub: "Para captar leads y agendar visitas", icon: "🏢", best: "Captación de Leads",
    focus: "Informa propiedades disponibles, zonas y rangos de precio, y agenda visitas con un asesor." },
  { id: "gimnasio", label: "Gimnasio / Fitness", sub: "Para membresías y clases", icon: "🏋️", best: "Captación de Leads",
    focus: "Informa membresías, precios, horarios de clases y promociones, y agenda una clase de prueba." },
  { id: "salon", label: "Salón de Belleza / Spa", sub: "Para citas y servicios de belleza", icon: "✨", best: "Agendar Citas",
    focus: "Informa servicios, precios y duración, y agenda citas con el profesional disponible." },
  { id: "servicios", label: "Servicios Profesionales", sub: "Abogados, contadores, consultores", icon: "💼", best: "Cotizaciones",
    focus: "Explica los servicios, recoge los detalles del caso y prepara una cotización o una primera consulta." },
  { id: "escuela", label: "Escuela / Academia", sub: "Para inscripciones y cursos", icon: "🎓", best: "Captación de Leads",
    focus: "Informa cursos, fechas de inicio, costos y requisitos, y guía el proceso de inscripción." },
];
const MANUAL: Industry = { id: "manual", label: "Negocio", sub: "", icon: "", best: "", focus: "Atiende a los clientes con la información que te proporcione el negocio." };

const OBJ: { label: string; dot: string; sub: string; method: string }[] = [
  { label: "Preguntas Frecuentes", dot: "bg-blue-500", sub: "Responde con precisión, anticipa dudas relacionadas y genera engagement natural",
    method: "Responde con precisión usando solo la base de conocimiento, anticipa dudas relacionadas y mantén la conversación natural." },
  { label: "Cotizaciones", dot: "bg-lime-500", sub: "Usa Value-Based Selling: descubre valor, personaliza solución, ancla precio y justifica inversión",
    method: "Usa Value-Based Selling: descubre qué valora el cliente, personaliza la solución, ancla el precio y justifica la inversión." },
  { label: "Agendar Citas", dot: "bg-indigo-500", sub: "Sugiere horarios disponibles proactivamente, reduce fricción y personaliza confirmaciones",
    method: "Sugiere horarios disponibles de forma proactiva, reduce la fricción y confirma la cita repitiendo fecha, hora y servicio." },
  { label: "Ventas", dot: "bg-orange-500", sub: "Usa SPIN Selling, gatillos mentales (escasez, urgencia) y técnicas de cierre avanzadas",
    method: "Usa SPIN Selling (situación, problema, implicación, necesidad), gatillos mentales con honestidad (escasez, urgencia) y técnicas de cierre." },
  { label: "Soporte al Cliente", dot: "bg-red-500", sub: "Metodología HEARD: escucha, empatiza, disculpa, resuelve y diagnostica",
    method: "Aplica la metodología HEARD: escucha, empatiza, discúlpate, resuelve y diagnostica. Si no puedes resolverlo, escala a una persona." },
  { label: "Captación de Leads", dot: "bg-sky-400", sub: "Cualifica con BANT, ofrece valor primero y clasifica prospectos en caliente/tibio/frío",
    method: "Cualifica con BANT (presupuesto, autoridad, necesidad, tiempo), ofrece valor primero y clasifica al prospecto como caliente, tibio o frío." },
];

export type Created = Pick<Agent, "id" | "name" | "system_prompt" | "model" | "ai_key_set" | "allowed_tags" | "collect_fields" | "description" | "objective" | "active">;

export function AgentWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Created) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState<Industry | null>(null);
  const [objective, setObjective] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const obj = OBJ.find((o) => o.label === objective);

  function pick(i: Industry) {
    setIndustry(i);
    setObjective(i.best);
    setName(i.id === "manual" ? "" : `Asistente de ${i.label}`);
    setStep(2);
  }

  async function launch() {
    if (!industry || !obj) return;
    setBusy(true);
    setErr(null);
    const prompt = [
      `Eres el asistente virtual de un negocio del sector ${industry.label}. ${industry.focus}`,
      `Objetivo principal: ${obj.label}. ${obj.method}`,
      "Reglas: responde siempre en español, con tono cercano y mensajes breves. No inventes datos; si no sabes algo, dilo y ofrece pasar la conversación a una persona del equipo.",
    ].join("\n\n");
    const description = industry.id === "manual" ? obj.label : `${industry.label} · ${industry.sub}`;
    const { data, error } = await supabase.rpc("save_ai_agent", {
      p_id: null, p_name: name, p_prompt: prompt, p_model: model, p_api_key: apiKey, p_allowed_tags: [], p_collect_fields: [],
      p_description: description, p_objective: obj.label, p_active: true,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    onCreated({
      id: data as string, name, system_prompt: prompt, model, ai_key_set: apiKey.trim() !== "", allowed_tags: [], collect_fields: [],
      description, objective: obj.label, active: true,
    });
  }

  const card = "rounded-xl border bg-white p-4 text-left hover:bg-slate-50";
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Configurar agente" onMouseDown={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="h-1 bg-slate-100"><div className="h-1 bg-slate-900 transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
        <div className="p-7">
          <div className="mb-6 flex items-center justify-between text-sm">
            <p><b className="font-semibold">Configurar Agente</b> <span className="text-slate-500">· Paso {step} de 3</span></p>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-500 hover:text-slate-900">✕</button>
          </div>

          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold">Selecciona tu industria</h2>
              <p className="mb-5 text-sm text-slate-500">Selecciona una plantilla para configurar rápidamente tu asistente</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {INDUSTRIES.map((i) => (
                  <button key={i.id} onClick={() => pick(i)} className={`${card} flex gap-3`}>
                    <span className="text-xl text-slate-500" aria-hidden>{i.icon}</span>
                    <span><span className="block text-sm font-semibold">{i.label}</span><span className="block text-xs text-slate-500">{i.sub}</span></span>
                  </button>
                ))}
              </div>
              <button onClick={() => pick(MANUAL)} className="mt-6 block w-full text-center text-sm text-slate-500 hover:text-slate-900">
                Mi industria no está aquí, configurar manualmente
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold">Selecciona el objetivo principal</h2>
              <p className="text-sm text-slate-500">Elige lo que quieres lograr con tu asistente</p>
              {industry && industry.id !== "manual" && <p className="mb-4 mt-1 text-xs">Basado en plantilla: <b>{industry.label}</b></p>}
              <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1" role="radiogroup" aria-label="Objetivo principal">
                {OBJ.map((o) => (
                  <li key={o.label}>
                    <button role="radio" aria-checked={objective === o.label} onClick={() => setObjective(o.label)}
                      className={`${card} flex w-full items-start gap-3 ${objective === o.label ? "border-slate-900 bg-slate-50" : ""}`}>
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${o.dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{o.label}</span>
                        {industry?.best === o.label && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[11px] text-orange-700">Recomendado</span>}
                        <span className="block text-xs text-slate-500">{o.sub}</span>
                      </span>
                      {objective === o.label && <span aria-hidden>✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between">
                <button onClick={() => setStep(1)} className="text-sm">‹ Atrás</button>
                <button disabled={!obj} onClick={() => setStep(3)} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">Siguiente ›</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold">Lanza tu agente</h2>
              <p className="mb-5 text-sm text-slate-500">
                {industry?.id !== "manual" && <>{industry?.label} · </>}{obj?.label}. Podrás ajustar las instrucciones y agregar tu base de conocimiento después.
              </p>
              <div className="space-y-3">
                <input required aria-label="Nombre del agente" placeholder="Nombre del agente" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border px-4 py-3 text-sm" />
                <select aria-label="Modelo" value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg border px-4 py-3 text-sm">
                  {MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
                <input type="password" autoComplete="off" aria-label="API key de OpenAI" placeholder="API key de OpenAI (sk-…)" value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)} className="w-full rounded-lg border px-4 py-3 text-sm" />
                <p className="text-xs text-slate-500">Sin API key el agente se crea, pero no responderá hasta que la agregues.</p>
              </div>
              {err && <p className="mt-3 text-sm text-red-600" role="alert">{err}</p>}
              <div className="mt-6 flex items-center justify-between">
                <button onClick={() => setStep(2)} className="text-sm">‹ Atrás</button>
                <button disabled={busy || !name.trim()} onClick={launch} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                  {busy ? "Creando…" : "🚀 Lanzar agente"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
