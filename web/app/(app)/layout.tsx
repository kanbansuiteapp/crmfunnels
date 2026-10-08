import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: pipeline }] = await Promise.all([
    supabase.from("profiles").select("name, role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("pipelines").select("id").order("created_at").limit(1).maybeSingle(),
  ]);

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <Sidebar pipelineId={pipeline?.id ?? null} name={me?.name ?? auth.user?.email ?? ""} role={me?.role ?? "agent"} />
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
