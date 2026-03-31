export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  // TODO: run scheduled automation jobs (relances, follow-ups)
  return NextResponse.json({ ok: true, ran_at: new Date().toISOString() });
}
