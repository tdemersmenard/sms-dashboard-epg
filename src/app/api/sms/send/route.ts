export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // TODO: implement SMS send via Twilio
  return NextResponse.json({ ok: true, body });
}
