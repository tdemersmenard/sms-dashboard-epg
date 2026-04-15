export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: "CHLORE",
    label: user.email as string,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const otpauthUrl = totp.toString();
  const qrCode = await QRCode.toDataURL(otpauthUrl);

  // Stocker le secret (sera activé après vérification via /enable-totp)
  await supabaseAdmin
    .from("admin_users")
    .update({ totp_secret: secret.base32, totp_enabled: false })
    .eq("id", user.id as string);

  return NextResponse.json({ qrCode, secret: secret.base32 });
}
