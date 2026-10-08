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

function Media({ m, url, out }: { m: Message; url?: string; out: boolean }) {
  if (!m.media_type) return null;
  if (!url) return <p className="mb-1 text-xs opacity-70">{m.media_url ? "Cargando archivo…" : "Archivo no disponible"}</p>;
  if (m.media_type === "image" || m.media_type === "sticker")
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={m.media_name ?? "Imagen"} loading="lazy"
          className={`rounded-lg object-cover ${m.media_type === "sticker" ? "h-32 w-32" : "max-h-72 max-w-full"}`} />
      </a>
    );
  if (m.media_type === "audio") return <audio controls preload="none" src={url} className="mb-1 h-10 max-w-full" />;
  if (m.media_type === "video") return <video controls preload="metadata" src={url} className="mb-1 max-h-72 max-w-full rounded-lg" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" download={m.media_name ?? undefined}
      className={`mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm underline ${out ? "bg-indigo-600/60" : "bg-white"}`}>
      📄 <span className="truncate">{m.media_name ?? "Documento"}</span>
    </a>
  );
}

export function MessageList({ messages, urls }: { messages: Message[]; urls: Record<string, string> }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, urls]);

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
                <Media m={m} url={m.media_url ? urls[m.media_url] : undefined} out={out} />
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                {!m.content && !m.media_type && <p className="italic opacity-70">Mensaje multimedia no disponible</p>}
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
