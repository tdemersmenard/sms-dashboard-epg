export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

export async function POST(req: NextRequest) {
  try {
    const { contactId } = await req.json();

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, phone, email, portal_password, portal_temp_password")
      .eq("id", contactId)
      .single();

    if (!contact) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    if (!contact.email) return NextResponse.json({ error: "Pas d'email" }, { status: 400 });

    // Si le client a DÉJÀ un mot de passe (qu'il a potentiellement changé), ne PAS le reset
    if (contact.portal_password) {
      return NextResponse.json({
        error: "Ce client a déjà un accès portail. Utilisez 'Reset mot de passe' si vous voulez en générer un nouveau.",
      }, { status: 400 });
    }

    // Générer un mot de passe temporaire
    const tempPassword = crypto.randomBytes(4).toString("hex");
    const hashed = await bcrypt.hash(tempPassword, 10);

    await supabaseAdmin
      .from("contacts")
      .update({ portal_password: hashed, portal_temp_password: tempPassword })
      .eq("id", contactId);

    const firstName = contact.first_name || "Bonjour";
    const sms = `Bonjour ${firstName}! Votre portail client Entretien Piscine Granby est maintenant disponible. Connectez-vous sur ${APP_URL}/portail avec votre courriel (${contact.email}) et le mot de passe temporaire: ${tempPassword}`;

    if (contact.phone?.startsWith("+")) {
      await fetch(`${APP_URL}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, body: sms }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-welcome] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
