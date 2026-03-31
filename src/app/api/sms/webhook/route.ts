export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  // TODO: handle incoming Twilio webhook
  console.log("SMS webhook received:", body);
  return NextResponse.json({ ok: true });
}
