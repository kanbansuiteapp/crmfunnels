import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlatformClient } from "@/components/platform/PlatformClient";

export default async function PlatformPage() {
  const supabase = createClient();
  const { data: isPlatform } = await supabase.rpc("is_platform_admin");
  if (isPlatform !== true) redirect("/");
  return <PlatformClient />;
}
