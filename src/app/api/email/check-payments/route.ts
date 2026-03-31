export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  try {
    // TODO: Connect to Gmail API to scan for Interac e-Transfer notifications
    // Look for emails from "notify@payments.interac.ca" or similar
    // Parse the sender name and amount
    // Match with contacts in DB by name or amount
    // Create payment record in payments table

    console.log("[check-payments] Would scan Gmail for Interac transfers");

    return NextResponse.json({
      checked: true,
      message: "Gmail integration pending — need to connect Gmail API",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[check-payments] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
