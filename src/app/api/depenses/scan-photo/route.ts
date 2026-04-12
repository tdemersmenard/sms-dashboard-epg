export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json() as { imageBase64: string };
    if (!imageBase64) {
      return NextResponse.json({ error: "Image requise" }, { status: 400 });
    }

    const mediaType = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: cleanBase64 },
          },
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
