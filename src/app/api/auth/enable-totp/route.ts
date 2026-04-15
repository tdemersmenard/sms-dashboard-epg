export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import * as OTPAuth from "otpauth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Code requis" }, { status: 400 });

  if (!user.totp_secret) {
    return NextResponse.json({ error: "Configurez le TOTP d'abord via /api/auth/setup-totp" }, { status: 400 });
  }

  const totp = new OTPAuth.TOTP({
    issuer: "CHLORE",
    label: user.email as string,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totp_secret as string),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    return NextResponse.json({ error: "Code invalide" }, { status: 401 });
  }

  await supabaseAdmin
    .from("admin_users")
    .update({ totp_enabled: true })
    .eq("id", user.id as string);

  return NextResponse.json({ success: true, message: "2FA activé avec succès" });
}
