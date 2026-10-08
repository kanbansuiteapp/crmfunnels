"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChannelForm } from "./ChannelForm";
import { ContactPanel } from "./ContactPanel";
import { ConversationList } from "./ConversationList";
import type { ChannelRef, Conversation, Member, Message } from "./types";

export function Inbox({
  initialConversations, channels, isAdmin, meId, team,
}: {
  initialConversations: Conversation[]; channels: ChannelRef[]; isAdmin: boolean; meId: string; team: Member[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState(initialConversations);
  const [channelsOk, setChannelsOk] = useState(channels.length > 0);
  const [selected, setSelected] = useState<string | null>(null); // como en Funnelchat: nada abierto al entrar
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const loadConversations = useCallback(async () => {
    const { data } = await supabase.rpc("inbox_conversations");
    if (data) setConversations(data as Conversation[]);
  }, [supabase]);

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("messages")
      .select("id, conversation_id, direction, content, by_ai, status, timestamp")
      .eq("conversation_id", id)
      .order("timestamp");
    if (data) setMessages(data as Message[]);
  }, [supabase]);

  // abrir un chat: se cargan sus mensajes y se marca como leído (también en pantalla, sin esperar)
  async function open(id: string) {
    setSelected(id);
    setErr(null);
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
    await supabase.rpc("mark_conversation_read", { p_id: id });
  }

  useEffect(() => {
    if (selected) loadMessages(selected);
    else setMessages([]);
  }, [selected, loadMessages]);

  // Realtime: mensajes nuevos y cambios de conversación
  useEffect(() => {
    const ch = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
        const row = (p.new ?? {}) as Message;
        const open = selectedRef.current;
        if (open && row.conversation_id === open) {
          loadMessages(open);
          // si llega un mensaje con el chat abierto, no se acumula como no leído
          if (row.direction === "in") supabase.rpc("mark_conversation_read", { p_id: open }).then(() => loadConversations());
          return;
        }
        loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversations())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, loadConversations, loadMessages]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const current = conversations.find((c) => c.id === selected) ?? null;

  async function patchConversation(patch: Record<string, unknown>) {
    if (!current) return;
    const { error } = await supabase.from("conversations").update(patch).eq("id", current.id);
    if (error) setErr(error.message);
    loadConversations();
  }

  async function toggleFavorite(id: string) {
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c)));
    const { error } = await supabase.rpc("toggle_favorite", { p_conversation: id });
    if (error) setErr(error.message);
    loadConversations();
  }

  async function markAllRead() {
    setConversations((cs) => cs.map((c) => ({ ...c, unread_count: 0 })));
    const { error } = await supabase.rpc("mark_all_read");
    if (error) setErr(error.message);
    loadConversations();
  }

  async function startConversation(channel: string, phone: string, name: string): Promise<string | null> {
    const { data, error } = await supabase.rpc("start_conversation", { p_channel: channel, p_phone: phone, p_name: name });
    if (error) return error.message;
    await loadConversations();
    open(data as string);
    return null;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !text.trim()) return;
    const content = text;
    setText("");
    setErr(null);
    const { data, error } = await supabase.functions.invoke("send-message", {
      body: { conversation_id: selected, content },
    });
    if (error) setErr("No se pudo enviar el mensaje.");
    else if (data && data.ok === false) setErr(`Envío fallido: ${data.detail ?? "error"}`);
    loadMessages(selected);
  }

  if (!channelsOk) return <ChannelForm onCreated={() => setChannelsOk(true)} />;

  const name = current ? current.contact.name ?? current.contact.phone_number : "";
  return (
    <div className="flex h-full min-h-0 gap-3">
      <ConversationList
        conversations={conversations} selected={selected} meId={meId} team={team} channels={channels}
        onSelect={open} onToggleFavorite={toggleFavorite} onMarkAllRead={markAllRead} onNew={startConversation}
      />

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border bg-white">
        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
            <span className="text-5xl" aria-hidden>💬</span>
            <p className="text-lg font-semibold text-slate-500">CRM</p>
            <p className="text-sm">Seleccione una conversación para iniciar</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                <p className="text-xs text-slate-500">{current.contact.phone_number} · {current.channel.name}</p>
              </div>
              {isAdmin && (
                <label className="ml-4 flex items-center gap-2 text-slate-600">
                  Asignado a
                  <select value={current.assignee_id ?? ""} onChange={(e) => patchConversation({ assignee_id: e.target.value || null })}
                    className="rounded border px-2 py-1">
                    <option value="">Sin asignar</option>
                    {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
              )}
              <span className="ml-auto flex gap-2">
                <button onClick={() => patchConversation({ ai_enabled: !current.ai_enabled })}
                  className={`rounded px-3 py-1 text-xs font-medium ${current.ai_enabled ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>
                  🤖 IA {current.ai_enabled ? "activa" : "pausada"}
                </button>
                <button onClick={() => patchConversation({ status: current.status === "open" ? "closed" : "open" })}
                  className="rounded border px-3 py-1 text-xs font-medium text-slate-700">
                  {current.status === "open" ? "Cerrar conversación" : "Reabrir"}
                </button>
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 && <p className="text-center text-sm text-slate-400">Aún no hay mensajes. Escribe el primero.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : ""}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? "bg-sky-600 text-white" : "bg-slate-100"}`}>
                    {m.by_ai && <span className="mr-1" title="Respuesta de la IA">🤖</span>}
                    {m.content}
                    {m.status === "failed" && <span className="ml-2 text-xs opacity-80">⚠ no enviado</span>}
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {err && <p className="px-4 text-sm text-red-600" role="alert">{err}</p>}
            <form onSubmit={send} className="flex gap-2 border-t p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…"
                className="flex-1 rounded border px-3 py-2 text-sm" />
              <button className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white">Enviar</button>
            </form>
          </>
        )}
      </section>
      {current && <ContactPanel key={current.contact.id} contactId={current.contact.id} />}
    </div>
  );
}
