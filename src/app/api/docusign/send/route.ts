export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generatePDFBuffer } from "@/lib/generate-pdf";
import { sendForSignature } from "@/lib/docusign";

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();

    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", doc.contact_id)
      .single();

    if (!contact?.email) {
      return NextResponse.json({ error: "Client has no email" }, { status: 400 });
    }

    const docData = (doc.data || {}) as Record<string, string>;
    const clientName =
      [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";

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

    const envelopeId = await sendForSignature(
      pdfBuffer,
      doc.doc_number,
      clientName,
      contact.email,
      docData.service || doc.doc_type,
      doc.amount
    );

    await supabaseAdmin
      .from("documents")
      .update({
        status: "envoyé",
        data: { ...docData, docusign_envelope_id: envelopeId },
      })
      .eq("id", doc.id);

    // Notifier Thomas
    const { data: thomas } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone", "+14509942215")
      .maybeSingle();

    if (thomas) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: thomas.id,
          body: `CHLORE: Contrat ${doc.doc_number} envoyé pour signature à ${clientName} (${contact.email}) via DocuSign`,
        }),
      }).catch((err) => console.error("[docusign-send] Thomas notif error:", err));
    }

    return NextResponse.json({ success: true, envelopeId });
  } catch (err) {
    console.error("[docusign-send] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
