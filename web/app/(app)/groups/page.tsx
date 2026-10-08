import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS: Record<string, { label: string; cls: string }> = {
  connected: { label: "Conectado", cls: "bg-green-100 text-green-700" },
  open: { label: "Conectado", cls: "bg-green-100 text-green-700" },
};

export default async function GroupsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { count: contacts }, { count: agents }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("channels").select("id, name, phone_number, status").order("created_at"),
  ]);
  if (!me) redirect("/");

  const stats = [
    { icon: "👥", label: "Contactos", value: contacts ?? 0 },
    { icon: "🧑‍💼", label: "Total de agentes", value: agents ?? 0 },
    { icon: "📱", label: "Dispositivos", value: channels?.length ?? 0 },
  ];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Grupos y comunidades</h1>
      <p className="mb-6 text-sm text-slate-500">Gestiona los grupos y comunidades de WhatsApp de tus dispositivos.</p>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {stats.map((c) => (
          <div key={c.label} className="flex items-center gap-4 rounded-2xl border bg-white p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl" aria-hidden>{c.icon}</span>
            <div><p className="text-sm text-slate-500">{c.label}</p><p className="text-2xl font-semibold">{c.value}</p></div>
          </div>
        ))}
      </div>

      {(channels ?? []).length === 0 ? (
        <p className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">
          Aún no tienes dispositivos. Conecta un número en la bandeja para ver aquí sus grupos.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(channels ?? []).map((c) => {
            const st = STATUS[c.status] ?? { label: "Desconectado", cls: "bg-slate-100 text-slate-600" };
            return (
              <li key={c.id} className="flex flex-col items-center rounded-2xl border bg-white p-6 text-center">
                <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl" aria-hidden>📱</span>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-indigo-600">{c.phone_number || "Sin registro"}</p>
                <span className={`mt-3 rounded-md px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                <p className="mt-4 text-xs text-slate-500">Grupos: sin datos</p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
