"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, sellerEmail } from "@/lib/countries";

type Who = "company" | "seller";

const input = "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400";

export default function LoginPage() {
  const router = useRouter();
  const [who, setWho] = useState<Who>("company");
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState("PE");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const country = COUNTRIES.find((c) => c[0] === cc)!;
  const digits = `${country[2]}${phone.replace(/\D/g, "")}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = createClient();
    const { data, error } = await sb.auth.signInWithPassword({
      email: who === "company" ? email.trim() : sellerEmail(digits),
      password,
    });
    if (error || !data.user) {
      setBusy(false);
      return setMsg(who === "company" ? "Correo o contraseña incorrectos." : "Número o contraseña incorrectos.");
    }

    const [{ data: isPlatform }, { data: prof }] = await Promise.all([
      sb.rpc("is_platform_admin"),
      sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle(),
    ]);
    // cada tipo de cuenta entra por su puerta
    if (who === "company" && isPlatform) { router.push("/platform"); router.refresh(); return; }
    if (!prof) { router.push("/account-suspended"); router.refresh(); return; }
    if (who === "company" && prof.role === "agent") {
      await sb.auth.signOut(); setBusy(false);
      return setMsg("Los vendedores ingresan con su número de WhatsApp. Cambia a “Soy vendedor”.");
    }
    if (who === "seller" && prof.role === "admin") {
      await sb.auth.signOut(); setBusy(false);
      return setMsg("Las empresas ingresan con su correo electrónico. Cambia a “Soy empresa”.");
    }
    router.push("/");
    router.refresh();
  }

  const tab = (w: Who, label: string) => (
    <button type="button" role="tab" aria-selected={who === w} onClick={() => { setWho(w); setMsg(null); setPassword(""); }}
      className={`flex-1 rounded-md py-2.5 text-sm font-medium transition ${who === w ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1d1b4d] p-4">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-2 text-lime-500" aria-hidden>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M3 4h18v2.6H3zM5.4 8.2h13.2v2.4H5.4zM8 12.2h8v2.2H8zM10.3 15.8h3.4v2H10.3z" /></svg>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-[#1d1b4d]">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-slate-500">Elige cómo vas a ingresar.</p>

        <div role="tablist" className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1">
          {tab("company", "Soy empresa")}
          {tab("seller", "Soy vendedor")}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          {who === "company" ? (
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-900">Correo electrónico</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="empresa@correo.com" className={input} />
            </div>
          ) : (
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-900">Número de WhatsApp</label>
              <div className="flex overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-indigo-400">
                <div className="relative flex items-center border-r border-slate-200 bg-slate-50 px-3">
                  <span className="pointer-events-none text-lg leading-none" aria-hidden>{country[3]}</span>
                  <span className="pointer-events-none ml-1 text-[10px] text-slate-500" aria-hidden>▾</span>
                  <select aria-label="País del número" value={cc} onChange={(e) => setCc(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
                    {COUNTRIES.map((c) => <option key={c[0]} value={c[0]}>{c[3]} {c[1]} (+{c[2]})</option>)}
                  </select>
                </div>
                <span className="flex items-center pl-3 text-sm text-slate-500">+{country[2]}</span>
                <input id="phone" type="tel" inputMode="tel" required autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s()-]/g, ""))} placeholder="912345678" className="w-full px-2 py-3 text-sm outline-none" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-900">Contraseña</label>
            <div className="relative">
              <input id="password" type={showPw ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-20`} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-indigo-600">{showPw ? "Ocultar" : "Mostrar"}</button>
            </div>
          </div>

          {msg && <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
          <button disabled={busy} className="w-full rounded-md bg-indigo-500 py-3 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          {who === "company" ? "¿No tienes cuenta? Tu proveedor crea el acceso de tu empresa." : "Tu empresa te crea el acceso. Si no puedes entrar, pídele que restablezca tu contraseña."}
        </p>
      </main>
    </div>
  );
}
