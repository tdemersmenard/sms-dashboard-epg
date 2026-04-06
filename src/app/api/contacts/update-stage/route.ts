export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { contactId, stage } = await req.json();
    if (!contactId || !stage) return NextResponse.json({ error: "contactId et stage requis" }, { status: 400 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, stage, portal_password, email, phone, first_name")
      .eq("id", contactId)
      .single();

    if (!contact) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });

    // Update le stage
    await supabaseAdmin.from("contacts").update({ stage }).eq("id", contactId);

    // Si le client passe à "closé" pour la première fois ET a un email ET pas encore de portail
    if (stage === "closé" && contact.email && !contact.portal_password) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

      // Appeler send-welcome qui va générer le mdp et envoyer le SMS
      await fetch(`${baseUrl}/api/portail/send-welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
