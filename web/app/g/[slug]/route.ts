import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Enlace público de una campaña: cuenta el clic y redirige al grupo que toca según la estrategia
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return new NextResponse("Enlace no válido", { status: 404 });

  const cookie = `gc_${slug}`;
  const prev = req.cookies.get(cookie)?.value;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.rpc("group_campaign_click", {
    p_slug: slug, p_prev: prev && /^[0-9a-f-]{36}$/i.test(prev) ? prev : null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.link || !/^https:\/\//.test(row.link)) return new NextResponse("Enlace no disponible", { status: 404 });

  const res = NextResponse.redirect(row.link, 302);
  res.cookies.set(cookie, row.group_id, { maxAge: 60 * 60 * 24 * 90, path: "/", sameSite: "lax", httpOnly: true });
  return res;
}
