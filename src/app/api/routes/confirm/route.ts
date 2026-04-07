export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { confirmRoutes } from "@/lib/routes/calculator";

export async function POST(req: NextRequest) {
  try {
    const { routes, sendSMS } = await req.json();
    const results = await confirmRoutes(routes, sendSMS);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
