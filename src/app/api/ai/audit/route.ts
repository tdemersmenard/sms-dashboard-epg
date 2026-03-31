export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { runAudit } from "@/lib/ai-audit";

export async function GET() {
  try {
    if (process.env.AI_AGENT_ENABLED !== "true") {
      return NextResponse.json({ error: "AI agent is disabled" }, { status: 403 });
    }
    const actions = await runAudit();
    return NextResponse.json({ actions, total: actions.length, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[ai-audit]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
