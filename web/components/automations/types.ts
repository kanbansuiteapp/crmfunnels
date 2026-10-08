export type Step = {
  type: "send_message" | "add_tag" | "move_stage" | "http_request" | "wait" | "condition";
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
};

export type Run = {
  id: string;
  status: string;
  created_at: string;
  automation: { name: string } | null;
};

export const TRIGGERS: Record<Trigger, { label: string; field: string; placeholder: string }> = {
  incoming_message: { label: "Mensaje entrante", field: "keyword", placeholder: "Palabra clave (opcional)" },
  tag_added: { label: "Etiqueta añadida", field: "tag_name", placeholder: "Nombre de la etiqueta (opcional)" },
  inactivity: { label: "Inactividad", field: "hours", placeholder: "Horas sin mensajes (24)" },
  webhook: { label: "Webhook de entrada", field: "event", placeholder: "Evento, ej. compra (opcional)" },
};

export const STEP_LABELS: Record<Step["type"], string> = {
  send_message: "Enviar mensaje",
  add_tag: "Añadir etiqueta",
  move_stage: "Mover a etapa",
  http_request: "Petición HTTP",
  wait: "Esperar",
  condition: "Condición",
};
