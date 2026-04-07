export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { calculateRoutes } from "@/lib/routes/calculator";

export async function POST() {
  try {
    const result = await calculateRoutes();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
