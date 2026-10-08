import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessageForm, type Target } from "@/components/messages/MessageForm";

export default async function NewScheduledMessagePage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: groups }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("wa_groups").select("id, name, type, participants").in("type", ["group", "community"]).order("name"),
  ]);
  if (me?.role !== "admin") redirect("/calendar");

  return (
    <main className="p-4 md:p-5">
      <MessageForm targets={(groups ?? []) as Target[]} />
    </main>
  );
}
