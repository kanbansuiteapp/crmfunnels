"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccountSuspended() {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1d1b4d] p-4">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <h1 className="text-2xl font-bold text-[#1d1b4d]">Cuenta no disponible</h1>
        <p className="mt-3 text-sm text-slate-600">
          Tu empresa está suspendida o tu usuario ya no tiene acceso. Comunícate con tu proveedor o con el administrador de tu empresa.
        </p>
        <button
          onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}
          className="mt-6 w-full rounded-md bg-indigo-500 py-3 text-sm font-medium text-white hover:bg-indigo-600">
          Cerrar sesión
        </button>
      </main>
    </div>
  );
}
