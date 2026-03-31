export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // TODO: handle incoming lead webhook from Make/Zapier
  console.log("Lead webhook received:", body);
  return NextResponse.json({ ok: true });
}
