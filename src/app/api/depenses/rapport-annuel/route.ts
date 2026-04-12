export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateRapportAnnuelBuffer } from "@/lib/depenses-pdf";
import type { Depense } from "@/lib/depenses-config";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const annee = parseInt(searchParams.get("annee") || String(new Date().getFullYear()));

    const { data, error } = await supabaseAdmin
      .from("depenses")
      .select("*")
      .eq("annee", annee)
      .order("date", { ascending: true });

    if (error) throw error;

    const pdfBuffer = await generateRapportAnnuelBuffer((data as Depense[]) || [], annee);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-fiscal-${annee}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[depenses/rapport-annuel]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
