export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";
import { encryptSecret } from "@/lib/franchise";

/** GET — Load current Twilio config (SID + phone, never the raw token) */
export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();

    const { data, error } = await supabaseAdmin
      .from("franchises")
      .select("twilio_account_sid, twilio_auth_token_encrypted, twilio_phone_number")
      .eq("id", franchiseId)
      .single();

    if (error) throw error;

    return NextResponse.json({
      accountSid: data.twilio_account_sid || "",
      hasToken: !!data.twilio_auth_token_encrypted,
      phoneNumber: data.twilio_phone_number || "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — Save Twilio credentials (auth token encrypted with AES-256-GCM) */
export async function POST(req: NextRequest) {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { accountSid, authToken, phoneNumber } = await req.json();

    if (!accountSid || !phoneNumber) {
      return NextResponse.json(
        { error: "Account SID et numéro de téléphone sont requis" },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, unknown> = {
      twilio_account_sid: accountSid.trim(),
      twilio_phone_number: phoneNumber.trim(),
    };

    // Only update token if a new one is provided
    if (authToken) {
      updatePayload.twilio_auth_token_encrypted = encryptSecret(authToken.trim());
    }

    const { error } = await supabaseAdmin
      .from("franchises")
      .update(updatePayload)
      .eq("id", franchiseId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
