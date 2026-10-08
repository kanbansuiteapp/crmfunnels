"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChannelForm } from "./ChannelForm";
import { ContactPanel } from "./ContactPanel";
import type { Conversation, Member, Message } from "./types";

export function Inbox({
  initialConversations,
  hasChannels,
  isAdmin,
  team,
}: {
  initialConversations: Conversation[];
  hasChannels: boolean;
  isAdmin: boolean;
  team: Member[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState(initialConversations);
  const [channelsOk, setChannelsOk] = useState(hasChannels);
  const [selected, setSelected] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("id, assignee_id, ai_enabled, last_message_at, contact:contacts(id, name, phone_number)")
      .order("last_message_at", { ascending: false });
    if (data) setConversations(data as unknown as Conversation[]);
  }

  async function loadMessages(id: string) {
    const { data } = await supabase
      .from("messages")
      .select("id, conversation_id, direction, content, by_ai, status, timestamp")
      .eq("conversation_id", id)
      .order("timestamp");
    if (data) setMessages(data as Message[]);
  }

  useEffect(() => {
    if (selected) loadMessages(selected);
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Realtime: mensajes nuevos y cambios de conversación
  useEffect(() => {
    const ch = supabase
      .channel("inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
        const row = (p.new ?? {}) as Message;
        if (row.conversation_id && row.conversation_id === selected) loadMessages(selected);
        loadConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
        loadConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selected]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const current = conversations.find((c) => c.id === selected) ?? null;

  async function reassign(assigneeId: string) {
    if (!selected) return;
    const { error } = await supabase
      .from("conversations")
      .update({ assignee_id: assigneeId || null })
      .eq("id", selected);
    if (error) setErr(error.message);
    loadConversations();
  }

  async function toggleAi() {
    if (!current) return;
    const { error } = await supabase
      .from("conversations").update({ ai_enabled: !current.ai_enabled }).eq("id", current.id);
    if (error) setErr(error.message);
    loadConversations();
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

  if (!channelsOk)
    return <ChannelForm onCreated={() => setChannelsOk(true)} />;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <aside className="w-72 shrink-0 overflow-y-auto rounded-xl border bg-white">
        {conversations.length === 0 && (
          <p className="p-4 text-sm text-slate-500">Aún no hay conversaciones.</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`block w-full border-b px-3 py-2 text-left hover:bg-slate-50 ${
              selected === c.id ? "bg-sky-50" : ""
            }`}
          >
            <p className="text-sm font-medium">{c.contact?.name ?? c.contact?.phone_number}</p>
            <p className="text-xs text-slate-500">{c.contact?.phone_number}</p>
          </button>
        ))}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border bg-white">
        {current && (
          <div className="flex items-center gap-3 border-b px-4 py-2 text-sm">
            {isAdmin && (
              <>
                <label htmlFor="assignee" className="text-slate-600">Asignado a</label>
                <select
                  id="assignee"
                  value={current.assignee_id ?? ""}
                  onChange={(e) => reassign(e.target.value)}
                  className="rounded border px-2 py-1"
                >
                  <option value="">Sin asignar</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </>
            )}
            <button
              onClick={toggleAi}
              className={`ml-auto rounded px-3 py-1 text-xs font-medium ${
                current.ai_enabled ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              🤖 IA {current.ai_enabled ? "activa" : "pausada"}
            </button>
          </div>
        )}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : ""}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  m.direction === "out" ? "bg-sky-600 text-white" : "bg-slate-100"
                }`}
              >
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
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!selected}
            placeholder="Escribe un mensaje…"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button disabled={!selected} className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Enviar
          </button>
        </form>
      </section>
      {current?.contact && <ContactPanel key={current.contact.id} contactId={current.contact.id} />}
    </div>
  );
}
