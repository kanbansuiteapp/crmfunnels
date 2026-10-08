import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhalinkForm } from "@/components/whalinks/WhalinkForm";

export default async function EditWhalinkPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: channels }, { data: link }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("channels").select("id, name, phone_number").order("created_at"),
    supabase.from("whalinks").select("id, name, message, tag_name, channel_id").eq("id", params.id).maybeSingle(),
  ]);
  if (me?.role !== "admin") redirect("/whalinks");
  if (!link) notFound();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <WhalinkForm link={link} devices={(channels ?? []).filter((c) => c.phone_number).map((c) => ({ id: c.id, name: c.name, phone: c.phone_number as string }))} />
    </main>
  );
}
