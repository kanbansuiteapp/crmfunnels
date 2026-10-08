"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Item = { href: string; label: string; icon: string };
type Section = { key: string; icon: string; label: string; title?: string; href?: string; items?: Item[]; divider?: boolean; bottom?: boolean };

const STORAGE = "crm.panel.collapsed";

// El área "Grupos y comunidades" tiene su propia barra clara; el resto del sistema usa la barra oscura.
const GROUP_AREA = ["/groups", "/group-campaigns", "/group-messages", "/calendar", "/apps"];

// iconos de línea (barra clara)
const LINE: Record<string, React.ReactNode> = {
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  grid: <><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>,
  megaphone: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
};
// iconos sólidos (barra oscura)
const SOLID: Record<string, React.ReactNode> = {
  home: <path d="M12 2.5 1.5 12H5v9h5.5v-6h3v6H19v-9h3.5z" fill="currentColor" stroke="none" />,
  user: <g fill="currentColor" stroke="none"><circle cx="12" cy="7.5" r="4.5" /><path d="M3.5 22a8.5 8.5 0 0 1 17 0z" /></g>,
  users: <g fill="currentColor" stroke="none"><circle cx="12" cy="7" r="3.8" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0z" /><circle cx="4.8" cy="9.5" r="2.5" /><path d="M0 19a5 5 0 0 1 6.2-4.6A8 8 0 0 0 4.6 19z" /><circle cx="19.2" cy="9.5" r="2.5" /><path d="M24 19a5 5 0 0 0-6.2-4.6A8 8 0 0 1 19.4 19z" /></g>,
  tools: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeWidth="2.2" /></>,
  phone: <path fillRule="evenodd" fill="currentColor" stroke="none" d="M8.5 1.5h7A2.5 2.5 0 0 1 18 4v16a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 20V4a2.5 2.5 0 0 1 2.5-2.5zM12 19.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z" />,
  pie: <g fill="currentColor" stroke="none"><path d="M12 2.2v9.8h9.8A9.8 9.8 0 0 0 12 2.2z" /><path d="M10 4.2A9.8 9.8 0 1 0 19.8 14H10z" /></g>,
  settings: LINE.settings,
};

function Glyph({ name, solid }: { name: string; solid: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={solid ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(solid ? SOLID : LINE)[name]}
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

  const on = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const groupArea = GROUP_AREA.some(on);

  const sections: Section[] = groupArea
    ? [
        { key: "home", icon: "home", label: "Inicio", href: "/dashboard" },
        { key: "gmsg", icon: "chat", label: "Mensajes de grupos y comunidades", href: "/group-messages" },
        { key: "apps", icon: "grid", label: "Aplicaciones", href: "/apps" },
        { key: "campaigns", icon: "megaphone", label: "Campañas", href: "/group-campaigns", divider: true },
        { key: "calendar", icon: "calendar", label: "Mensajes programados", href: "/calendar" },
        { key: "groups", icon: "users", label: "Grupos y comunidades", href: "/groups" },
      ]
    : [
        { key: "home", icon: "home", label: "Inicio", href: "/dashboard" },
        { key: "connections", icon: "phone", label: "Conexiones", href: "/connections" },
        {
          key: "1a1", icon: "user", label: "Interacciones 1 a 1", title: "Interacciones 1 a 1",
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
        { key: "groups", icon: "users", label: "Grupos y comunidades", href: "/groups" },
        { key: "tools", icon: "tools", label: "Herramientas", href: "/tools" },
        { key: "reports", icon: "pie", label: "Reportes", href: "/reports" },
        { key: "settings", icon: "settings", label: "Configuración", title: "Configuración", items: [
          { href: "/settings/tags", label: "Tags", icon: "i:tag" },
          { href: "/settings/custom-fields", label: "Campos customizados", icon: "i:filePlus" },
          { href: "/settings/agents", label: "Agentes", icon: "i:users" },
          { href: "/settings/templates", label: "Plantillas", icon: "i:file" },
        ] },
      ];

  const current = sections.find((s) => (s.href ? on(s.href) : s.items?.some((i) => on(i.href))));
  const entry = (s: Section) => s.href ?? s.items?.[0]?.href ?? "/dashboard";
  const showPanel = !groupArea && !!current?.items && !collapsed;
  const flat = sections.flatMap((s) => (s.items ? s.items : [{ href: s.href!, label: s.label, icon: "•" }]));

  const dark = !groupArea;
  const btn = (active: boolean) =>
    dark
      ? `flex h-11 w-11 items-center justify-center rounded-xl ${active ? "bg-white/20 text-white" : "text-white/90 hover:bg-white/10"}`
      : `flex h-11 w-11 items-center justify-center rounded-xl ${active ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"}`;

  return (
    <>
      {/* escritorio: columna de iconos (+ panel de la sección en la barra oscura) */}
      <div className="hidden shrink-0 md:flex">
        <nav className={`flex w-16 flex-col items-center gap-2 py-4 ${dark ? "bg-[#1d1b4d]" : "border-r bg-slate-50"}`} aria-label="Secciones">
          <span className={`mb-3 ${dark ? "text-lime-400" : "text-green-500"}`} aria-hidden>
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
                  className={btn(active)}
                >
                  <Glyph name={s.icon} solid={dark} />
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
                    {i.icon.startsWith("i:") ? <Icon name={i.icon.slice(2) as never} size={20} /> : <span aria-hidden>{i.icon}</span>}
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {!groupArea && !showPanel && current?.items && (
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
            {i.icon !== "•" && !i.icon.startsWith("i:") && i.icon} {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
