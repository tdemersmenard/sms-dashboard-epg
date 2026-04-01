export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generatePDFBuffer } from "@/lib/generate-pdf";

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

    const docData = (doc.data || {}) as Record<string, string>;
    const clientName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
      : "Client";

    const pdfBuffer = await generatePDFBuffer({
      docNumber: doc.doc_number,
      docType: doc.doc_type as "facture" | "contrat",
      clientName,
      clientAddress: contact?.address || docData.client_address,
      clientPhone: contact?.phone || docData.client_phone,
      clientEmail: contact?.email || docData.client_email,
      service: docData.service || doc.doc_type,
      amount: doc.amount,
      paymentTerms: docData.payment_terms || "",
    });

    // Upload dans Supabase Storage
    const filePath = `${doc.contact_id}/${doc.doc_number}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-pdf] Upload error:", uploadError);
    }

    // Get public URL and update document record
    const { data: urlData } = supabaseAdmin.storage
      .from("documents")
      .getPublicUrl(filePath);

    await supabaseAdmin
      .from("documents")
      .update({ pdf_url: urlData.publicUrl })
      .eq("id", doc.id);

    console.log("[generate-pdf] PDF generated and uploaded:", filePath);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.doc_number}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[generate-pdf] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
