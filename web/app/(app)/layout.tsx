import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: me }, { data: pipeline }] = await Promise.all([
    supabase.from("profiles").select("name, role").eq("id", auth.user?.id ?? "").maybeSingle(),
    supabase.from("pipelines").select("id").order("created_at").limit(1).maybeSingle(),
  ]);
  const email = auth.user?.email ?? "";

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <Sidebar pipelineId={pipeline?.id ?? null} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end border-b bg-white px-4">
          <UserMenu name={me?.name || email} email={email} role={me?.role ?? "agent"} />
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
