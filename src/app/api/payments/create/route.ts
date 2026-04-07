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

    // Recalculer le season_price total du contact
    const { data: allPayments } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("contact_id", contactId);

    const totalSeasonPrice = (allPayments || []).reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);

    await supabaseAdmin
      .from("contacts")
      .update({ season_price: totalSeasonPrice })
      .eq("id", contactId);

    // Si le client a entretien + adresse + ouverture, trigger auto-assign immédiat
    const { data: fullContact } = await supabaseAdmin
      .from("contacts")
      .select("services, address, ouverture_date")
      .eq("id", contactId)
      .single();

    if (fullContact) {
      const svcs = fullContact.services || [];
      const hasEntretien = svcs.some((s: string) => s.toLowerCase().includes("entretien"));
      if (hasEntretien && fullContact.address && fullContact.ouverture_date) {
        // Trigger auto-assign en background (non-bloquant)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
        fetch(`${baseUrl}/api/cron/automations`, {
          headers: { "Authorization": `Bearer ${process.env.CRON_SECRET || ""}` },
        }).catch(() => {});
      }
    }

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
          body: silentClient
            ? `CHLORE: Paiement de ${amount}$ créé pour ${name} (${description}). Aucun SMS au client (paiement futur).`
            : `CHLORE: Paiement de ${amount}$ créé pour ${name} (${description}). SMS envoyé au client.`,
        }),
      });
    }

    return NextResponse.json({ success: true, payment });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
