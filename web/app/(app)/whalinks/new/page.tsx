import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhalinkForm } from "@/components/whalinks/WhalinkForm";

export default async function NewWhalinkPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("channels").select("id, name, phone_number").order("created_at"),
  ]);
  if (me?.role !== "admin") redirect("/whalinks"); // solo administradores crean links

  return (
    <main className="mx-auto max-w-6xl p-6">
      <WhalinkForm devices={(channels ?? []).filter((c) => c.phone_number).map((c) => ({ id: c.id, name: c.name, phone: c.phone_number as string }))} />
    </main>
  );
}
