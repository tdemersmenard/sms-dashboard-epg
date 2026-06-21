export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generatePDFBuffer } from "@/lib/generate-pdf";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function POST(req: NextRequest) {
  try {
    const { contactId, lineItems, notes, sendEmail } = await req.json();

    if (!contactId || !lineItems || lineItems.length === 0) {
      return NextResponse.json({ error: "contactId et lineItems requis" }, { status: 400 });
    }

    const franchiseId = await getActiveFranchiseId();

    // Fetch contact
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("franchise_id", franchiseId)
      .single();

    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }

    // Calculate total from line items
    const total = Math.round(
      lineItems.reduce((sum: number, item: { total: number }) => sum + item.total, 0)
    );

    // Generate doc number FACT-2026-XXXX
    const { count } = await supabaseAdmin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("doc_type", "facture")
      .eq("franchise_id", franchiseId);
    const docNumber = `FACT-2026-${String((count || 0) + 1).padStart(4, "0")}`;

    const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
    const paymentTerms = "Paiement par virement Interac à service@entretienpiscinegranby.com, par carte via le portail client, ou comptant.";
    const serviceSummary = lineItems.map((i: { description: string }) => i.description).join(", ");

    // Generate PDF with line items
    const pdfBuffer = await generatePDFBuffer({
      docNumber,
      docType: "facture",
      clientName,
      clientAddress: contact.address,
      clientPhone: contact.phone,
      clientEmail: contact.email,
      service: serviceSummary,
      amount: total,
      paymentTerms,
      lineItems,
      notes: notes || undefined,
    });

    // Upload to Supabase Storage
    const filePath = `${contactId}/${docNumber}.pdf`;
    await supabaseAdmin.storage
      .from("documents")
      .upload(filePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

    const { data: urlData } = supabaseAdmin.storage
      .from("documents")
      .getPublicUrl(filePath);

    const pdfUrl = urlData?.publicUrl || null;

    // Create document record
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .insert({
        contact_id: contactId,
        doc_type: "facture",
        doc_number: docNumber,
        amount: total,
        status: "brouillon",
        pdf_url: pdfUrl,
        franchise_id: franchiseId,
        data: {
          client_name: clientName,
          client_address: contact.address,
          client_phone: contact.phone,
          client_email: contact.email,
          service: serviceSummary,
          line_items: lineItems,
          notes,
          payment_terms: paymentTerms,
        },
      })
      .select()
      .single();

    // Optionally send by email
    let emailSent = false;
    let emailError: string | null = null;

    if (sendEmail && doc) {
      if (!contact.email) {
        emailError = "no_email";
      } else {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
          const emailResp = await fetch(`${baseUrl}/api/email/send-document`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: doc.id, contactId }),
          });
          const emailResult = await emailResp.json();
          emailSent = emailResult.sent === true;
          if (!emailSent) emailError = emailResult.reason || "Erreur envoi email";

          if (emailSent) {
            await supabaseAdmin
              .from("documents")
              .update({ status: "envoyé" })
              .eq("id", doc.id);

            // Notify franchise owner
            if (franchiseId) {
              const { data: ownerFranchise } = await supabaseAdmin
                .from("franchises")
                .select("owner_phone")
                .eq("id", franchiseId)
                .single();

              if (ownerFranchise?.owner_phone) {
                let { data: ownerContact } = await supabaseAdmin
                  .from("contacts")
                  .select("id")
                  .eq("phone", ownerFranchise.owner_phone)
                  .eq("franchise_id", franchiseId)
                  .maybeSingle();

                if (!ownerContact) {
                  const { data: newOwner } = await supabaseAdmin
                    .from("contacts")
                    .insert({
                      first_name: "Propriétaire",
                      phone: ownerFranchise.owner_phone,
                      franchise_id: franchiseId,
                      stage: "complété",
                    })
                    .select("id")
                    .single();
                  ownerContact = newOwner;
                }

                if (ownerContact) {
                  await fetch(`${baseUrl}/api/sms/send`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      contactId: ownerContact.id,
                      body: `CHLORE: Facture ${docNumber} envoyée à ${clientName} (${contact.email}) — ${total}$`,
                    }),
                  });
                }
              }
            }
          }
        } catch (e) {
          emailError = String(e);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      documentId: doc?.id,
      docNumber,
      pdfUrl,
      total,
      emailSent,
      emailError,
      noEmail: !contact.email,
    });
  } catch (e) {
    console.error("[factures/create]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
