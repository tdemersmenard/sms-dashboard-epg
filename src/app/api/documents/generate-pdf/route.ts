export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();

    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", doc.contact_id)
      .single();

    const docData = (doc.data || {}) as Record<string, string>;
    const clientName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
      : "Client";
    const isContract = doc.doc_type === "contrat";
    const title = isContract ? "CONTRAT DE SERVICE" : "FACTURE";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #333; }
    .header { background: #0a1f3f; color: white; padding: 30px 40px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 5px 0 0; color: #94a3b8; font-size: 14px; }
    .doc-type { float: right; font-size: 28px; font-weight: bold; margin-top: -40px; }
    .content { padding: 30px 40px; }
    .info-bar { background: #f5f5f5; padding: 12px 20px; border-radius: 4px; margin-bottom: 24px; display: flex; justify-content: space-between; }
    .section { margin-bottom: 24px; }
    .section h3 { color: #0a1f3f; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 2px solid #0a1f3f; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #0a1f3f; color: white; padding: 10px 16px; text-align: left; font-size: 13px; }
    td { padding: 10px 16px; border-bottom: 1px solid #ddd; font-size: 14px; }
    .total-box { background: #0a1f3f; color: white; padding: 16px 24px; border-radius: 4px; text-align: right; margin-top: 24px; }
    .total-box span { font-size: 24px; font-weight: bold; }
    .payment-box { background: #f0f7ff; border: 1px solid #b3d4fc; border-radius: 8px; padding: 16px; margin-top: 24px; }
    .footer { background: #0a1f3f; color: #94a3b8; padding: 16px 40px; text-align: center; font-size: 12px; margin-top: 40px; }
    .signature { margin-top: 40px; display: flex; justify-content: space-between; }
    .sig-line { border-top: 1px solid #333; width: 200px; padding-top: 8px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ENTRETIEN PISCINE GRANBY</h1>
    <p>Thomas Demers-Ménard — 450-994-2215 — service@entretienpiscinegranby.com</p>
    <div class="doc-type">${title}</div>
  </div>
  <div class="content">
    <div class="info-bar">
      <div><strong>${doc.doc_number}</strong></div>
      <div>Date: ${new Date().toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}</div>
    </div>

    <div class="section">
      <h3>Client</h3>
      <p><strong>${clientName}</strong></p>
      ${contact?.address ? `<p>${contact.address}</p>` : ""}
      ${contact?.phone ? `<p>${contact.phone}</p>` : ""}
      ${contact?.email ? `<p>${contact.email}</p>` : ""}
    </div>

    <div class="section">
      <h3>Services</h3>
      <table>
        <tr><th>Description</th><th style="text-align:right">Montant</th></tr>
        <tr><td>${docData.service || doc.doc_type}</td><td style="text-align:right">${doc.amount}$</td></tr>
      </table>
    </div>

    <div class="total-box">
      TOTAL: <span>${doc.amount}$</span>
    </div>

    <div class="payment-box">
      <p style="margin:0"><strong>Paiement par virement Interac:</strong></p>
      <p style="margin:8px 0 0;font-size:16px">service@entretienpiscinegranby.com</p>
      <p style="margin:8px 0 0;font-size:13px;color:#666">${docData.payment_terms || ""}</p>
    </div>

    ${isContract ? `
    <div class="section" style="margin-top:32px">
      <h3>Conditions</h3>
      <p style="font-size:13px;line-height:1.6">
        Le présent contrat confirme l'entente entre Entretien Piscine Granby et le client pour les services décrits ci-dessus pour la saison 2026.
        Le service débute à l'ouverture de la piscine (mi-avril/début mai) et se termine à la fermeture (fin septembre/octobre).
        L'annulation est possible avec un préavis de 14 jours. Des frais d'administration de 100$ s'appliquent.
      </p>
    </div>
    <div class="signature">
      <div>
        <div class="sig-line">Signature du client</div>
        <p style="font-size:11px;color:#999;margin-top:4px">Date: _______________</p>
      </div>
      <div>
        <div class="sig-line">Thomas Demers-Ménard</div>
        <p style="font-size:11px;color:#999;margin-top:4px">Entretien Piscine Granby</p>
      </div>
    </div>
    ` : ""}
  </div>
  <div class="footer">
    Entretien Piscine Granby — 86 rue de Windsor, Granby QC J2H 1V4 — 450-994-2215
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="${doc.doc_number}.html"`,
      },
    });
  } catch (err) {
    console.error("[generate-pdf] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
