import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Enlace público de una campaña: cuenta el clic y redirige al grupo con cupo
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!/^[a-z0-9]{4,16}$/i.test(params.slug)) return new NextResponse("Enlace no válido", { status: 404 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.rpc("group_campaign_click", { p_slug: params.slug });
  if (typeof data !== "string" || !/^https:\/\//.test(data)) return new NextResponse("Enlace no disponible", { status: 404 });
  return NextResponse.redirect(data, 302);
}
