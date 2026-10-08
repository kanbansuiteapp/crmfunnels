"use client";

import { useEffect, useRef } from "react";
import type { Message } from "./types";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); // 01:21 PM, como en la referencia

function dayLabel(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === t.toDateString()) return "HOY";
  if (d.toDateString() === y.toDateString()) return "AYER";
  return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function MessageList({ messages }: { messages: Message[] }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0)
    return <p className="p-8 text-center text-sm text-slate-400">Aún no hay mensajes. Escribe el primero.</p>;

  let lastDay = "";
  return (
    <div className="space-y-3 p-4">
      {messages.map((m) => {
        const day = new Date(m.timestamp).toDateString();
        const showDay = day !== lastDay;
        lastDay = day;
        const out = m.direction === "out";
        return (
          <div key={m.id}>
            {showDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">{dayLabel(m.timestamp)}</span>
              </div>
            )}
            <div className={`flex items-end gap-2 ${out ? "justify-end" : ""}`}>
              {m.by_ai && !out && <span className="text-lg" aria-hidden>🤖</span>}
              <div className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm ${out ? "rounded-br-sm bg-indigo-500 text-white" : "rounded-bl-sm bg-indigo-50 text-slate-800"}`}>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${out ? "text-indigo-100" : "text-slate-400"}`}>
                  {clock(m.timestamp)}
                  {out && (m.status === "failed"
                    ? <span title="No se pudo enviar" className="font-semibold text-amber-200">⚠ no enviado</span>
                    : <span aria-label="Enviado">✓</span>)}
                </p>
              </div>
              {m.by_ai && out && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-white text-base" title="Respuesta de la IA">🤖</span>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottom} />
    </div>
  );
}
