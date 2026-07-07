export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      imageBase64?: string;
      fileBase64?: string;
      fileType?: string;
    };

    // Rétro-compat: { imageBase64 } (image simple) ou nouveau { fileBase64, fileType }
    const rawBase64 = body.fileBase64 ?? body.imageBase64;
    if (!rawBase64) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const isPdf =
      body.fileType === "application/pdf" ||
      rawBase64.startsWith("data:application/pdf");

    // Retire le préfixe data: quel que soit le type
    const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");

    let fileBlock: Anthropic.ContentBlockParam;
    if (isPdf) {
      fileBlock = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: cleanBase64 },
      };
    } else {
      const mediaType = rawBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      fileBlock = {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: cleanBase64 },
      };
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: [
          fileBlock,
          {
            type: "text",
            text: `Analyse ce reçu/facture et extrais les informations. Réponds UNIQUEMENT en JSON valide (sans markdown):
{
  "amount": number (montant total avec taxes, ex: 47.85),
  "vendor": "nom du commerce ou fournisseur",
  "description": "description courte des achats (max 80 chars)",
  "category": "vehicule" | "equipement" | "logiciels" | "repas" | "telephone" | "materiel" | "formation" | "autre",
  "date": "YYYY-MM-DD"
}

Choix de catégorie:
- vehicule: essence, station-service, auto, transport
- equipement: outils, hardware, équipement technique
- logiciels: apps, abonnements, logiciels, marketing, publicité
- repas: restaurants, épicerie (repas clients), déplacements repas
- telephone: téléphone, internet, telecom
- materiel: produits chimiques, pièces piscine, fournitures piscine
- formation: cours, formation, livres professionnels
- autre: tout le reste`,
          },
        ],
      }],
    });

    const rawText = (response.content[0] as { type: string; text: string }).text || "";
    const cleanText = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanText);

    return NextResponse.json({ success: true, ...parsed });
  } catch (err) {
    console.error("[depenses/scan-photo]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
