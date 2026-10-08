"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { ChannelForm } from "./ChannelForm";
import { Composer } from "./Composer";
import { ContactPanel } from "./ContactPanel";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
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
  const [showContact, setShowContact] = useState(true);
  const [err, setErr] = useState<string | null>(null);
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
    setShowContact(true);
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
        const openId = selectedRef.current;
        if (openId && row.conversation_id === openId) {
          loadMessages(openId);
          // si llega un mensaje con el chat abierto, no se acumula como no leído
          if (row.direction === "in") supabase.rpc("mark_conversation_read", { p_id: openId }).then(() => loadConversations());
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

  async function send(content: string) {
    if (!selected) return;
    setErr(null);
    const { data, error } = await supabase.functions.invoke("send-message", {
      body: { conversation_id: selected, content },
    });
    if (error) setErr("No se pudo enviar el mensaje.");
    else if (data && data.ok === false) setErr(`Envío fallido: ${data.detail ?? "error"}`);
    loadMessages(selected);
    loadConversations();
  }

  if (!channelsOk) return <ChannelForm onCreated={() => setChannelsOk(true)} />;

  const name = current ? current.contact.name ?? current.contact.phone_number : "";
  return (
    <div className="flex h-full min-h-0 gap-3">
      <ConversationList
        conversations={conversations} selected={selected} meId={meId} team={team} channels={channels}
        onSelect={open} onToggleFavorite={toggleFavorite} onMarkAllRead={markAllRead} onNew={startConversation}
      />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white">
        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
            <span className="text-5xl" aria-hidden>💬</span>
            <p className="text-lg font-semibold text-slate-500">CRM</p>
            <p className="text-sm">Seleccione una conversación para iniciar</p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
              <button onClick={() => setShowContact(!showContact)} className="flex min-w-0 items-center gap-3 text-left"
                aria-label="Mostrar u ocultar información del contacto" aria-pressed={showContact}>
                <Avatar name={name} size={42} />
                <span className="truncate font-semibold">{name}</span>
              </button>

              <div className="ml-auto flex items-center gap-3 text-sm">
                {current.ai_enabled && <span className="rounded bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">🤖 IA activa</span>}
                <div className="flex items-center gap-2 border-l pl-3">
                  <Avatar name={current.assignee_name ?? "?"} size={30} />
                  <div className="leading-tight">
                    <p className="text-[11px] text-slate-500">asignado a:</p>
                    {isAdmin ? (
                      <select value={current.assignee_id ?? ""} onChange={(e) => patchConversation({ assignee_id: e.target.value || null })}
                        aria-label="Asignado a" className="-ml-1 bg-transparent text-sm font-semibold outline-none">
                        <option value="">Sin asignar</option>
                        {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    ) : (
                      <p className="text-sm font-semibold">{current.assignee_name ?? "Sin asignar"}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => patchConversation({ ai_enabled: !current.ai_enabled })}
                  className="rounded-lg border px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  🤖 {current.ai_enabled ? "Pausar IA" : "Activar IA"}
                </button>
                <button onClick={() => patchConversation({ status: current.status === "open" ? "closed" : "open" })}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600">
                  {current.status === "open" ? "Cerrar conversación" : "Abrir conversación"}
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60">
              <MessageList messages={messages} />
            </div>
            {err && <p className="border-t bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">{err}</p>}
            <Composer channelName={current.channel.name} isAdmin={isAdmin} onSend={send} />
          </>
        )}
      </section>

      {current && showContact && (
        <ContactPanel key={current.contact.id} contactId={current.contact.id}
          onClose={() => setShowContact(false)} onChanged={loadConversations} />
      )}
    </div>
  );
}
