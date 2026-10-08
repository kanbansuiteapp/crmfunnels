import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddAgentForm } from "@/components/team/AddAgentForm";

export default async function TeamPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: members } = await supabase
    .from("profiles").select("id, name, email, role").order("created_at");
  const me = members?.find((m) => m.id === auth.user?.id);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-2xl p-4">
      <nav className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold">Equipo</h1>
        <Link href="/inbox" className="text-sm text-sky-700 underline">Bandeja</Link>
      </nav>
      <ul className="mb-6 divide-y rounded-xl border bg-white">
        {members?.map((m) => (
          <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{m.name} <span className="text-slate-500">{m.email}</span></span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{m.role === "admin" ? "Admin" : "Agente"}</span>
          </li>
        ))}
      </ul>
      {me.role === "admin" ? (
        <AddAgentForm />
      ) : (
        <p className="text-sm text-slate-500">Solo los administradores pueden agregar agentes.</p>
      )}
    </main>
  );
}
