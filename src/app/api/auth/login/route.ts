export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyPassword, createSession, createPendingSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    const { data: user } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .ilike("email", email.trim())
      .eq("active", true)
      .single();

    if (!user) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }

    const userAgent = req.headers.get("user-agent") ?? undefined;
    const ip = req.headers.get("x-forwarded-for") ?? undefined;

    // 2FA activé → créer une session pending en DB (fonctionne en serverless)
    if (user.totp_enabled && user.totp_secret) {
      const tempToken = await createPendingSession(user.id, userAgent, ip);
      return NextResponse.json({ requiresTotp: true, tempToken });
    }

    // Pas de 2FA → session complète directement
    const { token, expiresAt } = await createSession(user.id, userAgent, ip);

    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });
    return res;
  } catch (err: unknown) {
    console.error("[auth/login]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
