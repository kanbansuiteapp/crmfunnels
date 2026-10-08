"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (data.session) {
        router.push("/");
        router.refresh();
      } else setMsg("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto mt-24 w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">
        {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email" required placeholder="Correo" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <input
          type="password" required minLength={8} placeholder="Contraseña (mín. 8)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <button disabled={busy} className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {mode === "login" ? "Entrar" : "Registrarme"}
        </button>
        {msg && <p className="text-sm text-red-600" role="alert">{msg}</p>}
      </form>
      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-4 text-sm text-sky-700 underline"
      >
        {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
    </main>
  );
}
