export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

export async function POST(req: NextRequest) {
  try {
    const { contactId } = await req.json();
    if (!contactId) return NextResponse.json({ error: "contactId requis" }, { status: 400 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, phone, email, portal_password, portal_temp_password")
      .eq("id", contactId)
      .single();

    if (!contact?.phone) return NextResponse.json({ error: "Client sans numéro de téléphone" }, { status: 400 });

    const firstName = contact.first_name || "Client";
    let tempPassword = contact.portal_temp_password as string | null;

    // Only generate a new password if the client doesn't already have one
    if (!tempPassword) {
      tempPassword = generateTempPassword();
      const hashed = await bcrypt.hash(tempPassword, 10);
      await supabaseAdmin
        .from("contacts")
        .update({ portal_password: hashed, portal_temp_password: tempPassword })
        .eq("id", contactId);
    }

    // Build SMS
    let sms: string;
    if (contact.email) {
      sms = `Bonjour ${firstName}! Votre portail client Chlore est maintenant disponible. Connectez-vous sur ${APP_URL}/portail avec votre courriel (${contact.email}) et le mot de passe temporaire: ${tempPassword}. Nous vous recommandons de le changer après votre première connexion. Entretien Piscine Granby`;
    } else {
      sms = `Bonjour ${firstName}! Votre portail client Chlore est maintenant disponible sur ${APP_URL}/portail. Contactez-nous au 450-994-2215 pour obtenir vos accès. Entretien Piscine Granby`;
    }

    await fetch(`${APP_URL}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, body: sms }),
    });

    return NextResponse.json({ success: true, sentSMS: true, hasEmail: !!contact.email });
  } catch (err) {
    console.error("[send-welcome] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
