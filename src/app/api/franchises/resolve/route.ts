export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug requis" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("franchises")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Franchise non trouvée" }, { status: 404 });
  }

  return NextResponse.json(data);
}
