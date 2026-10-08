import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string; name: string | null; phone_number: string; created_at: string;
  contact_tags: { tag: { name: string; color: string } | null }[];
};

const LIMIT = 200;

export default async function ContactsPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("id").eq("id", auth.user?.id ?? "").maybeSingle();
  if (!me) redirect("/");

  // se limpia la búsqueda: los caracteres de sintaxis de PostgREST no deben colarse en el filtro
  const q = (searchParams.q ?? "").replace(/[^\p{L}\p{N}+ ]/gu, "").trim().slice(0, 60);
  let query = supabase
    .from("contacts")
    .select("id, name, phone_number, created_at, contact_tags(tag:tags(name, color))")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (q) query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contactos</h1>
        <form className="flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" aria-label="Buscar contactos"
            className="w-64 rounded-lg border px-3 py-2 text-sm" />
          <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Buscar</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Etiquetas</th><th className="px-4 py-3">Creado</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                {q ? "Ningún contacto coincide con la búsqueda." : "Aún no hay contactos. Aparecerán cuando alguien escriba a tu canal."}
              </td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{c.name ?? "Sin nombre"}</td>
                <td className="px-4 py-3 text-slate-600">{c.phone_number}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {c.contact_tags.map((t) => t.tag && (
                      <span key={t.tag.name} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: t.tag.color }}>
                        {t.tag.name}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(c.created_at).toLocaleDateString("es")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === LIMIT && <p className="mt-2 text-xs text-slate-500">Mostrando los {LIMIT} más recientes. Afina la búsqueda para ver otros.</p>}
    </main>
  );
}
