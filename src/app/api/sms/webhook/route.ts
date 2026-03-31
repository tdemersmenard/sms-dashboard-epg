export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  await req.text();
  // TODO: handle incoming Twilio webhook
  return NextResponse.json({ ok: true });
}
