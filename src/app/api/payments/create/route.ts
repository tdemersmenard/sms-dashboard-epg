export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { contactId, amount, description, dueDate, method, silentClient } = await req.json();

    if (!contactId || !amount || !description) {
      return NextResponse.json({ error: "contactId, amount et description requis" }, { status: 400 });
    }

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("first_name, last_name, phone")
      .eq("id", contactId)
      .single();

    if (!contact) return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });

    const { data: payment, error } = await supabaseAdmin.from("payments").insert({
      contact_id: contactId,
      amount,
      method: method || "interac",
      status: "en_attente",
      due_date: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      notes: description,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const clientName = contact.first_name || "Bonjour";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    if (contact.phone?.startsWith("+") && !silentClient) {
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          body: `Bonjour ${clientName}! Vous avez une demande de paiement de ${amount}$ pour: ${description}. Vous pouvez payer par virement Interac à service@entretienpiscinegranby.com ou par carte sur votre portail client. Merci!`,
        }),
      });
    }

    const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
    if (thomas) {
      const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Paiement de ${amount}$ créé pour ${name} (${description}). SMS envoyé.`,
        }),
      });
    }

    return NextResponse.json({ success: true, payment });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
