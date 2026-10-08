import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BroadcastWizard } from "@/components/broadcasts/BroadcastWizard";

export default async function NewBroadcastPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: channels }, { data: tags }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("channels").select("id, name, phone_number, status").order("created_at"),
    supabase.from("tags").select("id, name").order("name"),
  ]);
  if (me?.role !== "admin") redirect("/broadcasts"); // solo administradores crean envíos

  return (
    <main className="mx-auto max-w-6xl p-6">
      <BroadcastWizard
        devices={(channels ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone_number ?? "", status: c.status }))}
        tags={tags ?? []}
      />
    </main>
  );
}
