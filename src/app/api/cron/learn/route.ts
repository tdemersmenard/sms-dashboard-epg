export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { analyzeAndLearn } from "@/lib/ai-learning";

export async function GET() {
  try {
    const lessons = await analyzeAndLearn();
    return NextResponse.json({
      learned: lessons.length,
      lessons,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron-learn] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
