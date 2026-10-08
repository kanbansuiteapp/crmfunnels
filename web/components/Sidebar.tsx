"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = { pipelineId: string | null };

export function Sidebar({ pipelineId }: Props) {
  const pathname = usePathname();

  const items = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/inbox", label: "Bandeja", icon: "💬" },
    ...(pipelineId ? [{ href: `/pipelines/${pipelineId}`, label: "Pipeline", icon: "🗂️" }] : []),
    { href: "/automations", label: "Automatizaciones", icon: "⚡" },
    { href: "/agents", label: "Agentes IA", icon: "🤖" },
    { href: "/team", label: "Equipo", icon: "👥" },
  ];
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* escritorio: columna izquierda de arriba a abajo */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-white md:flex">
        <div className="px-5 py-4 text-lg font-semibold">CRM</div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Principal">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active(i.href) ? "bg-sky-50 font-semibold text-sky-800" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden>{i.icon}</span>
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* móvil: barra superior con desplazamiento horizontal */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white px-2 py-2 md:hidden" aria-label="Principal">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              active(i.href) ? "bg-sky-50 font-semibold text-sky-800" : "text-slate-600"
            }`}
          >
            {i.icon} {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
