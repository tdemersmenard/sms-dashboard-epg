export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { activatePendingSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import * as OTPAuth from "otpauth";

export async function POST(req: NextRequest) {
  try {
    const { tempToken, code } = await req.json();
    if (!tempToken || !code) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    // Récupérer la session pending depuis la DB (fonctionne en serverless)
    const { data: session } = await supabaseAdmin
      .from("admin_sessions")
      .select("user_id")
      .eq("token", tempToken)
      .eq("totp_pending", true)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session expirée, reconnectez-vous" }, { status: 401 });
    }

    const { data: user } = await supabaseAdmin
      .from("admin_users")
      .select("email, totp_secret")
      .eq("id", session.user_id)
      .single();

    if (!user?.totp_secret) {
      return NextResponse.json({ error: "Erreur de configuration 2FA" }, { status: 500 });
    }

    const totp = new OTPAuth.TOTP({
      issuer: "CHLORE",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.totp_secret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return NextResponse.json({ error: "Code invalide" }, { status: 401 });
    }

    // Activer la session (totp_pending → false + expiry prolongée)
    const result = await activatePendingSession(tempToken);
    if (!result) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.expiresAt,
      path: "/",
    });
    return res;
  } catch (err: unknown) {
    console.error("[auth/verify-totp]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
