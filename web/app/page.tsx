import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (pipeline) redirect(`/pipelines/${pipeline.id}`);
  // sin empresa activa (suspendida o sin asignar) no hay nada que mostrar
  redirect("/account-suspended");
}
