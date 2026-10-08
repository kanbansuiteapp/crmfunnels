import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = ["Nombre", "Estado", "Destinatarios", "Fecha de envío", "Creado"];

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle();
  if (!me) redirect("/");

  return (
    <main className="p-4 md:p-5">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Campañas</h1>
        <p className="text-base text-slate-600">0 registros en total</p>
      </div>

      <div className="scroll-x max-h-[calc(100vh-14rem)] rounded-2xl border border-slate-300 bg-white">
        <table className="w-full min-w-[900px] text-left text-base text-slate-900">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} className="whitespace-nowrap px-5 py-4 text-sm font-semibold uppercase tracking-wide text-slate-700">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={COLUMNS.length} className="px-5 py-16 text-center text-base text-slate-600">Aún no hay campañas.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
