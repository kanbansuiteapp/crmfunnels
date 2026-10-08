import Link from "next/link";
import { fmtBytes, fmtMB } from "@/lib/format";

type Ov = {
  contacts: number; agents: number; devices: number;
  max_contacts: number | null; max_agents: number | null; max_devices: number | null; max_storage_mb?: number | null; storage_bytes?: number | null;
  channels: { id: string; name: string; needs_reconnect: boolean; status: string }[];
};

const nf = new Intl.NumberFormat("es-PE");
const NEAR = 0.9;

// avisos fijos arriba: números que hay que volver a vincular y límites del plan cerca de agotarse (solo administradores)
export function AlertsBar({ ov }: { ov: Ov | null }) {
  if (!ov) return null;
  const items: { key: string; tone: "red" | "amber"; text: string; href: string; cta: string }[] = [];

  for (const c of ov.channels) {
    if (c.needs_reconnect && c.status !== "connected") {
      items.push({ key: `rc-${c.id}`, tone: "red", text: `Tu número “${c.name}” se desconectó de WhatsApp y no recibe mensajes.`, href: "/connections", cta: "Reconectar con QR" });
    }
  }
  const lim = (key: string, label: string, n: number, max: number | null) => {
    if (max == null || max <= 0) return;
    if (n >= max) items.push({ key, tone: "red", text: `Llegaste al límite de ${label} de tu plan (${nf.format(n)} / ${nf.format(max)}).`, href: "/connections", cta: "Ver plan" });
    else if (n / max >= NEAR) items.push({ key, tone: "amber", text: `Estás cerca del límite de ${label} de tu plan: ${nf.format(n)} de ${nf.format(max)} (${Math.floor((n / max) * 100)}%).`, href: "/connections", cta: "Ver plan" });
  };
  lim("lim-contacts", "contactos", ov.contacts, ov.max_contacts);
  lim("lim-agents", "vendedores", ov.agents, ov.max_agents);
  lim("lim-devices", "dispositivos", ov.devices, ov.max_devices);
  if (ov.max_storage_mb != null && ov.max_storage_mb > 0 && ov.storage_bytes != null) {
    const max = ov.max_storage_mb * 1048576, n = ov.storage_bytes;
    if (n >= max) items.push({ key: "lim-storage", tone: "red", text: `Llenaste el almacenamiento de tu plan (${fmtBytes(n)} / ${fmtMB(ov.max_storage_mb)}). No se guardarán más archivos.`, href: "/connections", cta: "Ver plan" });
    else if (n / max >= NEAR) items.push({ key: "lim-storage", tone: "amber", text: `Estás cerca del límite de almacenamiento de tu plan: ${fmtBytes(n)} de ${fmtMB(ov.max_storage_mb)} (${Math.floor((n / max) * 100)}%).`, href: "/connections", cta: "Ver plan" });
  }
  if (items.length === 0) return null;

  return (
    <div className="shrink-0" role="region" aria-label="Avisos">
      {items.map((i) => (
        <div key={i.key} role="alert" className={`flex flex-wrap items-center justify-between gap-2 px-6 py-2 text-sm ${i.tone === "red" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
          <span>{i.tone === "red" ? "⚠️" : "ℹ️"} {i.text}</span>
          <Link href={i.href} className="font-semibold underline">{i.cta}</Link>
        </div>
      ))}
    </div>
  );
}
