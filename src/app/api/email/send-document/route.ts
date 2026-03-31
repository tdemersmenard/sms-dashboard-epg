export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { documentId, contactId } = await req.json();

    // Fetch document
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    // Fetch contact
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const docData = doc.data as Record<string, string>;
    const clientEmail = docData?.client_email || contact?.email;
    const clientName = docData?.client_name || contact?.first_name || "Client";
    const docType = doc.doc_type === "facture" ? "Facture" : "Contrat";

    if (!clientEmail) {
      return NextResponse.json({ sent: false, reason: "no_email" });
    }

    // TODO: Integrate with Gmail API to actually send
    // For now, log what would be sent
    console.log(`[email] Would send to ${clientEmail}:`);
    console.log(`  Subject: ${docType} ${doc.doc_number} — Entretien Piscine Granby`);
    console.log(`  Body: ${docType} pour ${docData?.service} — Montant: ${doc.amount}$`);
    console.log(`  Payment terms: ${docData?.payment_terms}`);

    return NextResponse.json({ sent: true, email: clientEmail, document: doc.doc_number });
  } catch (err) {
    console.error("[email] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
