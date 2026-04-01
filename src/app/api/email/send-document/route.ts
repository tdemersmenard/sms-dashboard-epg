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
    const docTypeLabel = doc.doc_type === "facture" ? "Facture" : "Contrat";

    if (!clientEmail) {
      return NextResponse.json({ sent: false, reason: "no_email" });
    }

    // Générer le PDF
    const { generatePDFBuffer } = await import("@/lib/generate-pdf");
    const pdfBuffer = await generatePDFBuffer({
      docNumber: doc.doc_number,
      docType: doc.doc_type as "facture" | "contrat",
      clientName,
      clientAddress: contact.address || docData.client_address,
      clientPhone: contact.phone || docData.client_phone,
      clientEmail: contact.email || docData.client_email,
      service: docData.service || doc.doc_type,
      amount: doc.amount,
      paymentTerms: docData.payment_terms || "",
    });

    const pdfBase64 = pdfBuffer.toString("base64");

    try {
      const gmail = await getAuthedGmail();

      const boundary = "boundary_chlore_" + Date.now();
      const subject = `${docTypeLabel} ${doc.doc_number} — Entretien Piscine Granby`;

      const rawEmail = [
        `From: "Entretien Piscine Granby" <me>`,
        `To: ${clientEmail}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">`,
        `<p>Bonjour ${clientName},</p>`,
        `<p>Veuillez trouver ci-joint votre ${docTypeLabel.toLowerCase()} pour les services d'entretien de piscine.</p>`,
        `<p><strong>Document:</strong> ${doc.doc_number}<br>`,
        `<strong>Service:</strong> ${docData.service || ""}<br>`,
        `<strong>Montant:</strong> ${doc.amount}$</p>`,
        `<p><strong>Paiement par virement Interac:</strong> service@entretienpiscinegranby.com</p>`,
        `<p>Merci de votre confiance!</p>`,
        `<p>Thomas Demers-Ménard<br>Entretien Piscine Granby<br>450-994-2215</p>`,
        `</div>`,
        `--${boundary}`,
        `Content-Type: application/pdf; name="${doc.doc_number}.pdf"`,
        `Content-Disposition: attachment; filename="${doc.doc_number}.pdf"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        pdfBase64,
        `--${boundary}--`,
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

      // Notifier Thomas — une seule fois par document
      const { data: alreadyNotified } = await supabaseAdmin
        .from("automation_logs")
        .select("id")
        .eq("action", "invoice_sent_notif_" + doc.id)
        .limit(1);

      if (!alreadyNotified || alreadyNotified.length === 0) {
        const { data: thomas } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("phone", "+14509942215")
          .single();

        if (thomas) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
          const docTypeLabel = doc.doc_type === "facture" ? "Facture" : "Contrat";
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: thomas.id,
              body: `CHLORE: ${docTypeLabel} ${doc.doc_number} envoyée à ${clientName} (${clientEmail}) — ${doc.amount}$`,
            }),
          }).catch(err => console.error("[email] Notification error:", err));
        }

        await supabaseAdmin.from("automation_logs").insert({
          action: "invoice_sent_notif_" + doc.id,
          status: "success",
          details: { doc_number: doc.doc_number, email: clientEmail },
        });
      }

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
