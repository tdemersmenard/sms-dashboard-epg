export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthedGmail } from "@/lib/google";

export async function POST(req: NextRequest) {
  try {
    const { documentId, contactId } = await req.json();

    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (!doc || !contact) {
      return NextResponse.json({ error: "Document or contact not found" }, { status: 404 });
    }

    const docData = (doc.data || {}) as Record<string, string>;
    const clientEmail = contact.email || docData?.client_email;
    const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
    const docType = doc.doc_type === "facture" ? "Facture" : "Contrat";
    const paymentTerms = docData?.payment_terms || "";

    if (!clientEmail) {
      return NextResponse.json({ sent: false, reason: "no_email" });
    }

    const subject = `${docType} ${doc.doc_number} — Entretien Piscine Granby`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0a1f3f; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px;">Entretien Piscine Granby</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e5e5; border-top: none;">
          <p>Bonjour ${clientName},</p>
          <p>Voici votre ${docType.toLowerCase()} pour le service d'entretien de piscine:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f5f5f5;">
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">Document</td>
              <td style="padding: 12px; border: 1px solid #ddd;">${doc.doc_number}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">Service</td>
              <td style="padding: 12px; border: 1px solid #ddd;">${docData?.service || "Entretien de piscine"}</td>
            </tr>
            <tr style="background: #f5f5f5;">
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">Montant</td>
              <td style="padding: 12px; border: 1px solid #ddd; font-size: 18px; font-weight: bold;">${doc.amount}$</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">Modalités</td>
              <td style="padding: 12px; border: 1px solid #ddd;">${paymentTerms}</td>
            </tr>
          </table>
          <div style="background: #f0f7ff; border: 1px solid #b3d4fc; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Paiement par virement Interac:</p>
            <p style="margin: 8px 0 0; font-size: 16px;">service@entretienpiscinegranby.com</p>
          </div>
          <p>Si vous avez des questions, n'hésitez pas à me contacter au <strong>1 450-915-9650</strong>.</p>
          <p>Merci de votre confiance!</p>
          <p>Thomas Demers-Ménard<br>Entretien Piscine Granby</p>
        </div>
        <div style="background: #0a1f3f; color: #94a3b8; padding: 12px; text-align: center; font-size: 12px;">
          Entretien Piscine Granby — 1 450-915-9650 — service@entretienpiscinegranby.com
        </div>
      </div>
    `;

    try {
      const gmail = await getAuthedGmail();

      const rawEmail = [
        `From: "Entretien Piscine Granby" <service@entretienpiscinegranby.com>`,
        `To: ${clientEmail}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        htmlBody,
      ].join("\r\n");

      const encodedMessage = Buffer.from(rawEmail)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });

      await supabaseAdmin
        .from("documents")
        .update({ status: "envoyé" })
        .eq("id", doc.id);

      return NextResponse.json({ sent: true, email: clientEmail, document: doc.doc_number });
    } catch (gmailErr) {
      console.error("[email] Gmail send error:", gmailErr);
      return NextResponse.json({ sent: false, error: "Gmail not connected or send failed" }, { status: 500 });
    }
  } catch (err) {
    console.error("[email] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
