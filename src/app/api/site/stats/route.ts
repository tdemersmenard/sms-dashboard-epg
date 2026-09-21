import { NextResponse } from "next/server";
import { computeSiteStats } from "@/lib/site-stats";

export const revalidate = 300; // cache 5 min

/** Stats publiques — vraies données, aucune donnée personnelle. */
export async function GET() {
  const out = await computeSiteStats();
  return NextResponse.json(out, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
