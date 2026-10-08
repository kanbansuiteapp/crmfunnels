import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export default async function Home() {
  const supabase = createClient();
  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (pipeline) redirect(`/pipelines/${pipeline.id}`);
  return <Onboarding />;
}
