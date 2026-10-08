"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type FinalConnectionState, type Node,
} from "@xyflow/react";
import { createClient } from "@/lib/supabase/client";
import type { Automation, Folder, RunWithLog } from "../types";
import { FlowContext, NoteNode, PickerNode, StepNode, TriggerNode, type FlowCtx } from "./nodes";
import { RunsPanel } from "./panels";
import { TriggerModal } from "./TriggerModal";
import {
  createsCycle, defaultConfig, freeSpot, graphToTree, META, treeToGraph, validateStep,
  type Cfg, type Kind, type PickerData, type StepNodeData, type Tree, type TriggerData,
} from "./model";

const nodeTypes = { trigger: TriggerNode, step: StepNode, note: NoteNode, picker: PickerNode };
const PICKER = "picker";

type Panel = { kind: "trigger" } | { kind: "runs" } | null;

type Props = {
  automation?: Automation; folders: Folder[]; runs: RunWithLog[]; agents: { id: string; name: string }[]; isAdmin: boolean;
  tags: string[]; hooks: { id: string; name: string }[]; orgId: string;
};

function Editor({ automation, folders, runs, agents, isAdmin, tags, hooks, orgId }: Props) {
  const router = useRouter();
  const flow = useReactFlow();

  const initial = useMemo(() => treeToGraph(
    (automation?.actions_tree_json ?? { steps: [] }) as unknown as Tree,
    { trigger_type: automation?.trigger_type ?? "incoming_message", conditions: automation?.conditions ?? {}, set: !!automation },
  ), [automation]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);

  const defaultName = useMemo(() => `Flujo del ${new Date().toLocaleDateString("es")} a las ${new Date().toLocaleTimeString("es")}`, []);
  const [name, setName] = useState(automation?.name ?? defaultName);
  const [enabled, setEnabled] = useState(automation?.enabled ?? false);
  const [folderId, setFolderId] = useState<string | null>(automation?.folder_id ?? null);
  // en una automatización nueva se abre directo la ventana del disparador (sin él no se puede guardar)
  const [panel, setPanel] = useState<Panel>(automation || !isAdmin ? null : { kind: "trigger" });
  const [err, setErr] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const canEdit = isAdmin;

  const touch = useCallback(() => { setDirty(true); setSaved(false); }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ───────── operaciones sobre el lienzo ─────────
  const closePicker = useCallback(() => {
    setNodes((ns) => ns.filter((n) => n.id !== PICKER));
    setEdges((es) => es.filter((e) => e.target !== PICKER));
  }, [setNodes, setEdges]);

  // abre la ventanita "¿Qué desea agregar?" unida a la salida indicada (en `at` si se soltó el arrastre ahí)
  const openAdd = useCallback((sourceId: string, handle: string, at?: { x: number; y: number }) => {
    setNodes((ns) => {
      const rest = ns.filter((n) => n.id !== PICKER);
      const parent = rest.find((n) => n.id === sourceId);
      const position = at ?? freeSpot(rest, parent, handle);
      return [...rest, { id: PICKER, type: "picker", position, data: { sourceId, handle } satisfies PickerData, deletable: false, selectable: false }];
    });
    setEdges((es) => [
      ...es.filter((e) => e.target !== PICKER),
      { id: `${sourceId}:${handle}->${PICKER}`, source: sourceId, sourceHandle: handle, target: PICKER, type: "smoothstep", animated: true },
    ]);
  }, [setNodes, setEdges]);

  // la ventanita se convierte en el paso elegido, en el mismo lugar y con la misma línea
  const pick = useCallback((kind: Kind) => {
    const picker = nodes.find((n) => n.id === PICKER);
    if (!picker) return;
    const { sourceId, handle } = picker.data as PickerData;
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setNodes((ns) => [
      ...ns.filter((n) => n.id !== PICKER),
      { id, type: "step", position: picker.position, data: { kind, config: defaultConfig(kind) } satisfies StepNodeData },
    ]);
    setEdges((es) => [
      ...es.filter((e) => e.target !== PICKER && !(e.source === sourceId && (e.sourceHandle ?? "next") === handle)),
      { id: `${sourceId}:${handle}->${id}`, source: sourceId, sourceHandle: handle, target: id, type: "smoothstep" },
    ]);
    touch();
  }, [nodes, setNodes, setEdges, touch]);

  // arrastrar desde una salida libre y soltar en el vacío abre la ventanita ahí mismo
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!canEdit || state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return;
    const handle = state.fromHandle.id ?? "next";
    if (edges.some((e) => e.source === state.fromNode!.id && (e.sourceHandle ?? "next") === handle)) return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const p = flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
    openAdd(state.fromNode.id, handle, { x: p.x, y: p.y - 40 });
  }, [canEdit, edges, flow, openAdd]);

  const removeNode = useCallback((id: string) => {
    closePicker();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    if (node.type === "note") {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      touch();
      return;
    }
    const data = node.data as StepNodeData;
    // una condición arrastra sus dos ramas; un paso normal deja unido el anterior con el siguiente
    const doomed = new Set([id]);
    if (data.kind === "condition") {
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const e of edges) if (e.source === cur && !doomed.has(e.target)) { doomed.add(e.target); stack.push(e.target); }
      }
      if (doomed.size > 1 && !confirm(`Se eliminarán también los ${doomed.size - 1} pasos de sus ramas. ¿Continuar?`)) return;
    }
    const incoming = edges.find((e) => e.target === id && e.source !== PICKER);
    const next = data.kind === "condition" ? undefined : edges.find((e) => e.source === id && (e.sourceHandle ?? "next") === "next" && e.target !== PICKER);
    setNodes((ns) => ns.filter((n) => !doomed.has(n.id)));
    setEdges((es) => {
      const kept = es.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
      if (incoming && next) {
        kept.push({ id: `${incoming.source}:${incoming.sourceHandle ?? "next"}->${next.target}`, source: incoming.source,
          sourceHandle: incoming.sourceHandle ?? "next", target: next.target, type: "smoothstep" });
      }
      return kept;
    });
    touch();
  }, [nodes, edges, setNodes, setEdges, touch, closePicker]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const h = c.sourceHandle ?? "next";
    setEdges((es) => [
      // una salida y una entrada por nodo: el flujo es un árbol
      ...es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === h) && e.target !== c.target),
      { id: `${c.source}:${h}->${c.target}`, source: c.source, sourceHandle: h, target: c.target, type: "smoothstep" },
    ]);
    touch();
  }, [setEdges, touch]);

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const target = nodes.find((n) => n.id === c.target);
    return !!c.source && !!c.target && c.target !== c.source && target?.type === "step" && !createsCycle(edges, c.source, c.target);
  }, [nodes, edges]);

  const setConfig = (id: string, config: Cfg) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, config, invalid: false } } : n)));
    touch();
  };

  const addNote = () => {
    const vp = flow.getViewport();
    const id = `note${Date.now().toString(36)}`;
    setNodes((ns) => [...ns, { id, type: "note", position: { x: (-vp.x + 120) / vp.zoom, y: (-vp.y + 120) / vp.zoom }, data: { text: "" } }]);
    touch();
  };

  const ctx: FlowCtx = {
    openAdd: (sourceId, handle) => openAdd(sourceId, handle),
    pick, closePicker,
    openTrigger: () => setPanel({ kind: "trigger" }),
    setConfig,
    remove: removeNode,
    hasEdge: (s, h) => edges.some((e) => e.source === s && (e.sourceHandle ?? "next") === h),
    setNoteText: (id, text) => { setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n))); touch(); },
    agents, orgId, canEdit,
  };

  // ───────── guardar ─────────
  async function save() {
    const problems: string[] = [];
    if (!name.trim()) problems.push("Escribe un nombre para la automatización.");
    const trig = nodes.find((n) => n.id === "trigger")!.data as TriggerData;
    if (!trig.set) problems.push("Asigna un disparador (pulsa «+ Nuevo disparador»).");

    const realNodes = nodes.filter((n) => n.id !== PICKER);
    const { tree, orphans } = graphToTree(realNodes, edges.filter((e) => e.target !== PICKER));
    if (tree.steps.length === 0) problems.push("Añade al menos un paso conectado al disparador.");

    const bad = new Set<string>();
    const reachable = realNodes.filter((n) => n.type === "step" && !orphans.includes(n.id));
    for (const n of reachable) {
      const d = n.data as StepNodeData;
      const p = validateStep(d.kind, d.config);
      if (p) { bad.add(n.id); problems.push(`${META[d.kind].label}: ${p}.`); }
    }
    setNodes((ns) => ns.map((n) => (n.type === "step" ? { ...n, data: { ...n.data, invalid: bad.has(n.id) } } : n)));
    if (problems.length) return setErr(problems);
    if (orphans.length && !confirm(`Hay ${orphans.length} paso(s) sin conectar al flujo que no se guardarán. ¿Guardar de todos modos?`)) return;

    setBusy(true);
    setErr([]);
    const supabase = createClient();
    const conditions = Object.fromEntries(
      Object.entries(trig.conditions).filter(([, v]) => String(v).trim() !== "").map(([k, v]) => [k, k === "hours" ? Number(v) : v]),
    );
    const { data, error } = await supabase.rpc("save_automation", {
      p_id: automation?.id ?? null, p_name: name, p_trigger: trig.trigger_type, p_conditions: conditions, p_tree: tree, p_enabled: enabled,
    });
    const id = (automation?.id ?? data) as string;
    const folderErr = error ? null : (await supabase.rpc("set_automation_folder", { p_id: id, p_folder: folderId })).error;
    setBusy(false);
    if (error || folderErr) return setErr([(error ?? folderErr)!.message]);

    setDirty(false);
    setSaved(true);
    if (!automation) router.replace(`/automations/${id}`);
    else router.refresh();
  }

  async function remove() {
    if (!automation || !confirm("¿Eliminar esta automatización? No se puede deshacer.")) return;
    const { error } = await createClient().from("automations").delete().eq("id", automation.id!);
    if (error) return setErr([error.message]);
    setDirty(false);
    router.push("/automations");
    router.refresh();
  }

  function back() {
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Salir de todos modos?")) return;
    setDirty(false);
    router.push("/automations");
  }

  const trigData = nodes.find((n) => n.id === "trigger")?.data as TriggerData;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <button onClick={back} className="text-sm font-semibold text-slate-700 hover:text-indigo-700">← Volver</button>
        <input value={name} onChange={(e) => { setName(e.target.value); touch(); }} maxLength={100} disabled={!canEdit} aria-label="Nombre de la automatización"
          className="min-w-[200px] flex-1 rounded-lg border bg-slate-50 px-4 py-2 text-sm" />
        <select value={folderId ?? ""} onChange={(e) => { setFolderId(e.target.value || null); touch(); }} disabled={!canEdit} aria-label="Carpeta"
          className="rounded-lg border bg-white px-3 py-2 text-sm">
          <option value="">Sin carpeta</option>
          {folders.map((f) => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
        </select>
        {automation && (
          <button onClick={() => setPanel({ kind: "runs" })} className="rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ejecuciones</button>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          {enabled ? "Activo" : "Inactivo"}
          <button type="button" role="switch" aria-checked={enabled} disabled={!canEdit} onClick={() => { setEnabled(!enabled); touch(); }}
            className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-indigo-500" : "bg-slate-300"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </label>
        {canEdit && (
          <>
            {automation && <button onClick={remove} aria-label="Eliminar automatización" title="Eliminar automatización" className="text-lg text-slate-400 hover:text-red-600">🗑</button>}
            <button onClick={save} disabled={busy} className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50">
              {busy ? "Guardando…" : saved ? "Guardado ✓" : "Guardar automatización"}
            </button>
          </>
        )}
      </header>

      {err.length > 0 && (
        <div role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">
          <ul className="list-inside list-disc">{err.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-slate-50">
        <FlowContext.Provider value={ctx}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" && x.dragging)) touch(); }}
            onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
            onConnectEnd={onConnectEnd}
            onPaneClick={() => { setPanel(null); if (nodes.some((n) => n.id === PICKER)) closePicker(); }}
            nodesDraggable={canEdit} nodesConnectable={canEdit}
            deleteKeyCode={null} fitView fitViewOptions={{ padding: 0.35, maxZoom: 1 }} minZoom={0.3} maxZoom={1.6}
            defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#94a3b8", strokeWidth: 2 } }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#cbd5e1" />
            <Controls position="top-right" showInteractive aria-label="Controles del lienzo" />
            <MiniMap position="bottom-right" pannable zoomable ariaLabel="Mapa del flujo" />
          </ReactFlow>

          {panel?.kind === "runs" && <RunsPanel runs={runs} onClose={() => setPanel(null)} />}
        </FlowContext.Provider>

        {panel?.kind === "trigger" && trigData && (
          <TriggerModal data={trigData} tags={tags} hooks={hooks} canEdit={canEdit} onClose={() => setPanel(null)}
            onSave={(d) => { setNodes((ns) => ns.map((n) => (n.id === "trigger" ? { ...n, data: d } : n))); touch(); setPanel(null); }} />
        )}

        {canEdit && (
          <button onClick={addNote} className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-amber-950 shadow hover:bg-amber-300">
            ✎ Agregar nota
          </button>
        )}
      </div>
    </div>
  );
}

export function FlowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
