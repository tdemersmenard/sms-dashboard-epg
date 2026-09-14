export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { generatePDFBuffer } from "@/lib/generate-pdf";

/**
 * Rendu PDF de test (facture ou contrat) avec des données d'exemple —
 * pour vérifier le branding sans toucher aux vrais documents.
 * Protégé par CRON_SECRET. GET ?type=facture|contrat
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = new URL(req.url).searchParams.get("type") === "contrat" ? "contrat" : "facture";
  const buffer = await generatePDFBuffer({
    docType: type as "facture" | "contrat",
    docNumber: type === "contrat" ? "C-2026-TEST" : "FACT-2026-TEST",
    clientName: "Client Exemple",
    clientAddress: "123 rue des Piscines, Granby QC",
    clientEmail: "client@example.com",
    clientPhone: "450-555-0123",
    service: "Fermeture de piscine hors-terre",
    amount: 200,
    paymentTerms: "Payable le jour du service — Interac ou carte via le portail",
    lineItems: [
      { description: "Fermeture de piscine hors-terre", qty: 1, unitPrice: 200, total: 200 },
    ],
    notes: "Document de test — vérification du branding.",
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf" },
  });
}
