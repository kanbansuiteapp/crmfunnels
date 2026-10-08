import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhalinksClient, type Whalink } from "@/components/whalinks/WhalinksClient";

export default async function WhalinksPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: links }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("whalinks")
      .select("id, name, slug, message, tag_name, clicks, leads, channel:channels(name)").order("created_at", { ascending: false }),
    supabase.from("channels").select("id, name, phone_number").order("created_at"),
  ]);
  if (!me) redirect("/");

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Whalink</h1>
      <p className="mb-6 text-sm text-slate-500">
        Enlaces cortos que abren WhatsApp con tu número y un mensaje listo. Cuentan los clics y los leads que escriben.
      </p>
      <WhalinksClient
        links={(links ?? []) as unknown as Whalink[]}
        channels={(channels ?? []).filter((c) => c.phone_number).map((c) => ({ id: c.id, name: c.name }))}
        isAdmin={me.role === "admin"}
      />
    </main>
  );
}
