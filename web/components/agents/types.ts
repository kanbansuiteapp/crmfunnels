export type Agent = {
  id: string | null;
  name: string;
  system_prompt: string;
  model: string;
  ai_key_set: boolean;
  allowed_tags: string[];
  collect_fields: string[];
  description: string;
  objective: string;
  active: boolean;
};

export type ChannelRow = { id: string; name: string; ai_agent_id: string | null };
export type Source = { id: string; agent_id: string; kind: string; title: string | null };

export const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

export const OBJECTIVES = ["Preguntas Frecuentes", "Cotizaciones", "Agendar Citas", "Ventas", "Soporte al Cliente", "Captación de Leads"];
