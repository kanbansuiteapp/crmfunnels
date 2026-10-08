"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; icon: string };
type Section = { key: string; icon: string; label: string; title?: string; href?: string; items?: Item[]; divider?: boolean; bottom?: boolean };

const STORAGE = "crm.panel.collapsed";

// iconos de línea de la columna lateral
const PATHS: Record<string, React.ReactNode> = {
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  grid: <><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>,
  megaphone: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
};
function Glyph({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

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
    { key: "home", icon: "home", label: "Inicio", href: "/dashboard" },
    {
      key: "1a1", icon: "chat", label: "Interacciones 1 a 1", title: "Interacciones 1 a 1",
      items: [
        { href: "/inbox", label: "Chat", icon: "💬" },
        { href: "/group-messages", label: "Mensajes", icon: "✉️" },
        { href: "/contacts", label: "Contactos", icon: "👤" },
        ...(pipelineId ? [{ href: `/pipelines/${pipelineId}`, label: "Tableros", icon: "🗂️" }] : []),
        { href: "/whalinks", label: "Whalink", icon: "🔗" },
        { href: "/automations", label: "Automatizaciones", icon: "⚡" },
        { href: "/broadcasts", label: "Envío masivo", icon: "📣" },
        { href: "/agents", label: "Agentes de IA", icon: "🤖" },
      ],
    },
    { key: "apps", icon: "grid", label: "Aplicaciones", href: "/apps" },
    { key: "campaigns", icon: "megaphone", label: "Campañas", href: "/group-campaigns", divider: true },
    { key: "calendar", icon: "calendar", label: "Calendario", href: "/calendar" },
    { key: "groups", icon: "users", label: "Grupos y comunidades", href: "/groups" },
    {
      key: "settings", icon: "settings", label: "Configuración", title: "Configuración", bottom: true,
      items: [{ href: "/team", label: "Equipo", icon: "👥" }],
    },
  ];

  const on = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const current = sections.find((s) => (s.href ? on(s.href) : s.items?.some((i) => on(i.href))));
  const entry = (s: Section) => s.href ?? s.items?.[0]?.href ?? "/dashboard";
  const showPanel = !!current?.items && !collapsed;
  const flat = sections.flatMap((s) => (s.items ? s.items : [{ href: s.href!, label: s.label, icon: "•" }]));

  return (
    <>
      {/* escritorio: columna de iconos + panel de la sección */}
      <div className="hidden shrink-0 md:flex">
        <nav className="flex w-16 flex-col items-center gap-2 border-r bg-slate-50 py-4" aria-label="Secciones">
          <span className="mb-3 text-green-500" aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M3 4h18v2.6H3zM5.4 8.2h13.2v2.4H5.4zM8 12.2h8v2.2H8zM10.3 15.8h3.4v2H10.3z" /></svg>
          </span>
          {sections.map((s) => {
            const active = current?.key === s.key;
            return (
              <div key={s.key} className={`flex flex-col items-center gap-2 ${s.bottom ? "mt-auto" : ""}`}>
                {s.divider && <hr className="my-1 w-8 border-slate-200" />}
                <Link
                  href={entry(s)}
                  title={s.label}
                  aria-label={s.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => s.items && toggle(false)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    active ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                  }`}
                >
                  <Glyph name={s.icon} />
                </Link>
              </div>
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
