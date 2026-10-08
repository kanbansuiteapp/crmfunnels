import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Enlace público: cuenta el clic y redirige a WhatsApp con el mensaje precargado
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!/^[a-z0-9]{4,16}$/i.test(params.slug)) return new NextResponse("Enlace no válido", { status: 404 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.rpc("whalink_click", { p_slug: params.slug });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.phone) return new NextResponse("Enlace no válido", { status: 404 });

  const url = `https://wa.me/${row.phone}${row.msg ? `?text=${encodeURIComponent(row.msg)}` : ""}`;
  return NextResponse.redirect(url, 302);
}
