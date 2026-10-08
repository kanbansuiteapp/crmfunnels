export type Step = {
  type: "send_message" | "add_tag" | "move_stage" | "http_request" | "wait" | "condition" | "assign" | "rotator" | "ai";
  config: Record<string, string | number>;
  then?: Step[];
  else?: Step[];
};

export type Trigger = "incoming_message" | "tag_added" | "inactivity" | "webhook";

export type Automation = {
  id: string | null;
  name: string;
  trigger_type: Trigger;
  conditions: Record<string, string | number>;
  actions_tree_json: { steps: Step[] };
  enabled: boolean;
  folder_id: string | null;
};

export type Run = {
  id: string;
  status: string;
  created_at: string;
  automation: { name: string } | null;
};

export const TRIGGERS: Record<Trigger, { label: string; field: string; placeholder: string }> = {
  incoming_message: { label: "Mensaje recibido", field: "keyword", placeholder: "Palabra clave (opcional)" },
  tag_added: { label: "Tag agregado", field: "tag_name", placeholder: "Tag (opcional)" },
  webhook: { label: "Integración con terceros", field: "event", placeholder: "Evento, ej. compra (opcional)" },
  inactivity: { label: "Inactividad", field: "hours", placeholder: "Horas sin mensajes (24)" },
};

export const STEP_LABELS: Record<Step["type"], string> = {
  send_message: "Enviar mensaje",
  add_tag: "Añadir etiqueta",
  move_stage: "Mover a etapa",
  http_request: "Petición HTTP",
  wait: "Esperar",
  condition: "Condición",
  assign: "Asignar conversación",
  rotator: "Rotador",
  ai: "Asignar asistente de IA",
};

export type Folder = { id: string; name: string };

export type AutomationRow = {
  id: string; name: string; trigger_type: Trigger; conditions: Record<string, string | number>;
  enabled: boolean; created_at: string; folder_id: string | null; runs: { count: number }[];
};

export type RunWithLog = {
  id: string; status: string; created_at: string;
  log: { step?: string; ok?: boolean; detail?: string; error?: string; result?: boolean; minutes?: number }[];
};
