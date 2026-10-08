import type { Edge, Node } from "@xyflow/react";
import type { Trigger } from "../types";

// ───────────── tipos del flujo ─────────────
export type Kind = "send_message" | "wait" | "add_tag" | "move_stage" | "http_request" | "condition" | "assign" | "rotator" | "ai";
export type Cfg = Record<string, string | number>;
export type Pos = { x: number; y: number };

// El árbol que entiende el motor (supabase/functions/_shared/engine.ts). `pos` es solo de la interfaz.
export type TreeStep = { type: Kind; config?: Cfg; then?: TreeStep[]; else?: TreeStep[]; pos?: Pos };
export type NoteData = { id: string; text: string; pos: Pos };
export type Tree = { steps: TreeStep[]; trigger_pos?: Pos; notes?: NoteData[] };

export type TriggerData = { trigger_type: Trigger; conditions: Cfg; set: boolean; [k: string]: unknown };
export type StepNodeData = { kind: Kind; config: Cfg; invalid?: boolean; [k: string]: unknown };
export type NoteNodeData = { text: string; [k: string]: unknown };

export const NODE_W = 280;
const COL = 360;
const ROW = 210;

// ───────────── catálogo (panel "¿Qué desea agregar?") ─────────────
export const META: Record<Kind, { label: string; icon: string; blurb: string }> = {
  send_message: { label: "Enviar mensaje", icon: "💬", blurb: "Envía un mensaje de texto al contacto." },
  wait: { label: "Esperar", icon: "⏱️", blurb: "Pausa el flujo durante un tiempo." },
  add_tag: { label: "Añadir etiqueta", icon: "🏷️", blurb: "Etiqueta al contacto." },
  move_stage: { label: "Mover a etapa", icon: "🗂️", blurb: "Mueve su deal a otra etapa del pipeline." },
  http_request: { label: "Petición HTTP", icon: "🔗", blurb: "Avisa a otra plataforma (https)." },
  condition: { label: "Condición", icon: "🔀", blurb: "Bifurca el flujo según se cumpla o no." },
  assign: { label: "Asignar conversación", icon: "👤", blurb: "Asigna el chat a un agente concreto." },
  rotator: { label: "Rotador", icon: "🔄", blurb: "Reparte el chat al agente con menos conversaciones abiertas." },
  ai: { label: "Asignar asistente de IA", icon: "🤖", blurb: "Activa el asistente de IA del canal en este chat." },
};

export const UNITS = { min: 1, h: 60, d: 1440 } as const;
export type Unit = keyof typeof UNITS;
export const UNIT_LABEL: Record<Unit, string> = { min: "minutos", h: "horas", d: "días" };

export const defaultConfig = (k: Kind): Cfg =>
  k === "wait" ? { amount: 5, unit: "min", minutes: 5 }
  : k === "http_request" ? { method: "POST", url: "" }
  : k === "condition" ? { field: "message_contains", value: "" }
  : {};

// ───────────── resumen y validación de cada nodo ─────────────
export function summary(kind: Kind, c: Cfg, agents: { id: string; name: string }[]): string | null {
  switch (kind) {
    case "send_message": return String(c.text ?? "").trim() ? String(c.text) : null;
    case "add_tag": return String(c.name ?? "").trim() ? `Etiqueta: ${c.name}` : null;
    case "move_stage": return String(c.stage_name ?? "").trim() ? `Mover a: ${c.stage_name}` : null;
    case "http_request": return String(c.url ?? "").trim() ? `${c.method ?? "POST"} ${c.url}` : null;
    case "wait": return `${c.amount ?? 1} ${Number(c.amount ?? 1) === 1 ? ({ min: "minuto", h: "hora", d: "día" } as const)[(c.unit as Unit) ?? "min"] : UNIT_LABEL[(c.unit as Unit) ?? "min"]}`;
    case "condition": return String(c.value ?? "").trim() ? `${c.field === "has_tag" ? "Tiene la etiqueta" : "Mensaje contiene"}: «${c.value}»` : null;
    case "assign": return agents.find((a) => a.id === c.agent_id)?.name ?? null;
    case "rotator": return META.rotator.blurb;
    case "ai": return META.ai.blurb;
  }
}

export function validateStep(kind: Kind, c: Cfg): string | null {
  switch (kind) {
    case "send_message": return String(c.text ?? "").trim() ? null : "escribe el mensaje";
    case "add_tag": return String(c.name ?? "").trim() ? null : "indica la etiqueta";
    case "move_stage": return String(c.stage_name ?? "").trim() ? null : "indica la etapa";
    case "http_request": return /^https:\/\//i.test(String(c.url ?? "")) ? null : "la URL debe empezar por https://";
    case "wait": return Number(c.minutes) >= 1 ? null : "indica el tiempo de espera";
    case "condition": return String(c.value ?? "").trim() ? null : "indica qué debe contener";
    case "assign": return c.agent_id ? null : "elige el agente";
    default: return null;
  }
}

// ───────────── árbol -> lienzo ─────────────
export function treeToGraph(tree: Tree, trigger: Omit<TriggerData, "set"> & { set: boolean }) {
  const nodes: Node[] = [{
    id: "trigger", type: "trigger", position: tree.trigger_pos ?? { x: 0, y: 0 }, data: trigger, deletable: false,
  }];
  const edges: Edge[] = [];
  let n = 0;

  // devuelve la siguiente fila libre; las ramas de una condición se apilan en filas distintas
  function place(steps: TreeStep[], parent: string, handle: string, depth: number, row: number): number {
    if (steps.length === 0) return row;
    const [s, ...rest] = steps;
    const id = `n${++n}`;
    nodes.push({
      id, type: "step", position: s.pos ?? { x: depth * COL, y: row * ROW },
      data: { kind: s.type, config: { ...(s.config ?? {}) } } satisfies StepNodeData,
    });
    edges.push({ id: `${parent}:${handle}->${id}`, source: parent, sourceHandle: handle, target: id, type: "smoothstep" });
    if (s.type === "condition") {
      // en el lienzo cada rama llega hasta su final: los pasos que seguían a la condición se copian a ambas ramas
      const yes = [...(s.then ?? []), ...rest];
      const no = [...(s.else ?? []), ...rest];
      let r = place(yes, id, "yes", depth + 1, row);
      r = place(no, id, "no", depth + 1, Math.max(r, row + 1));
      return Math.max(r, row + 1);
    }
    return place(rest, id, "next", depth + 1, row);
  }
  place(tree.steps ?? [], "trigger", "next", 1, 0);

  for (const note of tree.notes ?? []) {
    nodes.push({ id: note.id, type: "note", position: note.pos, data: { text: note.text } satisfies NoteNodeData });
  }
  return { nodes, edges };
}

// ───────────── lienzo -> árbol ─────────────
export function graphToTree(nodes: Node[], edges: Edge[]): { tree: Tree; orphans: string[] } {
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const visited = new Set<string>(["trigger"]);
  const out = (source: string, handle: string) => edges.find((e) => e.source === source && (e.sourceHandle ?? "next") === handle);

  function chain(source: string, handle: string): TreeStep[] {
    const e = out(source, handle);
    const node = e && byId.get(e.target);
    if (!node || node.type !== "step" || visited.has(node.id)) return [];
    visited.add(node.id);
    const d = node.data as StepNodeData;
    const pos = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    if (d.kind === "condition") {
      return [{ type: "condition", config: d.config, pos, then: chain(node.id, "yes"), else: chain(node.id, "no") }];
    }
    return [{ type: d.kind, config: d.config, pos }, ...chain(node.id, "next")];
  }

  const trig = byId.get("trigger");
  const steps = chain("trigger", "next");
  const notes: NoteData[] = nodes.filter((nd) => nd.type === "note").map((nd) => ({
    id: nd.id, text: String((nd.data as NoteNodeData).text ?? ""), pos: { x: Math.round(nd.position.x), y: Math.round(nd.position.y) },
  }));
  const orphans = nodes.filter((nd) => nd.type === "step" && !visited.has(nd.id)).map((nd) => nd.id);
  return {
    tree: { steps, trigger_pos: trig ? { x: Math.round(trig.position.x), y: Math.round(trig.position.y) } : undefined, notes },
    orphans,
  };
}

// ¿conectar source -> target crearía un ciclo?
export function createsCycle(edges: Edge[], source: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of edges) if (e.source === cur) stack.push(e.target);
  }
  return false;
}

// Posición libre para un nodo nuevo a la derecha del padre (evita encimarse con otros)
export function freeSpot(nodes: Node[], parent: Node | undefined, handle: string): Pos {
  const base = parent ?? { position: { x: 0, y: 0 } };
  const dy = handle === "yes" ? -90 : handle === "no" ? 130 : 0;
  const x = base.position.x + COL;
  let y = base.position.y + dy;
  while (nodes.some((nd) => Math.abs(nd.position.x - x) < NODE_W && Math.abs(nd.position.y - y) < 150)) y += 170;
  return { x, y };
}
