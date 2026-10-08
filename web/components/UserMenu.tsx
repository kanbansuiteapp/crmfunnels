"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white">
          {initials(name)}
        </span>
        <span className="hidden text-sm font-medium sm:block">{name}</span>
        <span aria-hidden className="text-xs text-slate-500">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-60 rounded-xl border bg-white p-1 shadow-lg">
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
            <p className="text-xs text-slate-500">{role === "admin" ? "Administrador" : "Agente"}</p>
          </div>
          <Link role="menuitem" href="/profile" onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100">Mi perfil</Link>
          <button role="menuitem" onClick={logout}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
