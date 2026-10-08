"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; icon: string };
type Section = { key: string; icon: string; label: string; title?: string; href?: string; items?: Item[] };

const STORAGE = "crm.panel.collapsed";

export function Sidebar({ pipelineId }: { pipelineId: string | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE) === "1"); } catch { /* sin almacenamiento: queda abierto */ }
  }, []);
  const toggle = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem(STORAGE, v ? "1" : "0"); } catch { /* idem */ }
  };

  const sections: Section[] = [
    { key: "home", icon: "🏠", label: "Inicio", href: "/dashboard" },
    {
      key: "1a1", icon: "💬", label: "Interacciones 1 a 1", title: "Interacciones 1 a 1",
      items: [
        { href: "/inbox", label: "Chat", icon: "💬" },
        { href: "/contacts", label: "Contactos", icon: "👤" },
        ...(pipelineId ? [{ href: `/pipelines/${pipelineId}`, label: "Tableros", icon: "🗂️" }] : []),
        { href: "/whalinks", label: "Whalink", icon: "🔗" },
        { href: "/automations", label: "Automatizaciones", icon: "⚡" },
        { href: "/broadcasts", label: "Envío masivo", icon: "📣" },
        { href: "/agents", label: "Agentes de IA", icon: "🤖" },
      ],
    },
    {
      key: "groups", icon: "🫂", label: "Grupos y comunidades", title: "Grupos y comunidades",
      items: [
        { href: "/groups", label: "Grupos y comunidades", icon: "👥" },
        { href: "/group-campaigns", label: "Campañas", icon: "🔗" },
        { href: "/group-messages", label: "Mensajes", icon: "💬" },
      ],
    },
    { key: "team", icon: "👥", label: "Equipo", href: "/team" },
  ];

  const on = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const current = sections.find((s) => (s.href ? on(s.href) : s.items?.some((i) => on(i.href))));
  const entry = (s: Section) => s.href ?? s.items?.[0]?.href ?? "/dashboard";
  const showPanel = !!current?.items && !collapsed;
  const flat = sections.flatMap((s) => (s.items ? s.items : [{ href: s.href!, label: s.label, icon: s.icon }]));

  return (
    <>
      {/* escritorio: columna de iconos + panel de la sección */}
      <div className="hidden shrink-0 md:flex">
        <nav className="flex w-16 flex-col items-center gap-2 bg-slate-900 py-4" aria-label="Secciones">
          {sections.map((s) => {
            const active = current?.key === s.key;
            return (
              <Link
                key={s.key}
                href={entry(s)}
                title={s.label}
                aria-label={s.label}
                aria-current={active ? "page" : undefined}
                onClick={() => s.items && toggle(false)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${
                  active ? "bg-indigo-500/30" : "hover:bg-white/10"
                }`}
              >
                <span aria-hidden>{s.icon}</span>
              </Link>
            );
          })}
        </nav>

        {showPanel && current?.items && (
          <aside className="flex w-60 flex-col border-r bg-white" aria-label={current.title}>
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{current.title}</h2>
              <button onClick={() => toggle(true)} aria-label="Ocultar panel" title="Ocultar panel"
                className="rounded p-1 text-slate-500 hover:bg-slate-100">«</button>
            </div>
            <ul className="space-y-1 px-3">
              {current.items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={on(i.href) ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                      on(i.href) ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span aria-hidden>{i.icon}</span>
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {!showPanel && current?.items && (
          <button onClick={() => toggle(false)} aria-label="Mostrar panel" title="Mostrar panel"
            className="h-fit self-start rounded-r-lg border border-l-0 bg-white px-1.5 py-2 text-slate-500 hover:bg-slate-100">»</button>
        )}
      </div>

      {/* móvil: barra superior con desplazamiento horizontal */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white px-2 py-2 md:hidden" aria-label="Principal">
        {flat.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              on(i.href) ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600"
            }`}
          >
            {i.icon} {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
