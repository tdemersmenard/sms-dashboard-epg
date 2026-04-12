export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthedGmail } from "@/lib/google";
import Anthropic from "@anthropic-ai/sdk";
import type { CategorieDepense } from "@/lib/depenses-config";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Mapping catégories IA → nos CategorieDepense
const CAT_MAP: Record<string, CategorieDepense> = {
  materiel:   "materiel",
  essence:    "vehicule",
  outils:     "equipement",
  marketing:  "logiciels",
  telecom:    "telephone",
  repas:      "repas",
  vehicule:   "vehicule",
  equipement: "equipement",
  logiciels:  "logiciels",
  telephone:  "telephone",
  formation:  "formation",
  autre:      "autre",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(part: any): string {
  if (part?.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (part?.parts) return part.parts.map(extractBody).join("\n");
  return "";
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const gmail = await getAuthedGmail();

    const oneHourAgo = Math.floor((Date.now() - 3600 * 1000) / 1000);
    const { data: messagesData } = await gmail.users.messages.list({
      userId: "me",
      q: `(facture OR invoice OR receipt OR reçu OR commande OR achat) after:${oneHourAgo}`,
      maxResults: 30,
    });

    const gmailMessages = messagesData?.messages || [];
    const detected: { vendor: string; montant: number; categorie: string }[] = [];

    for (const msg of gmailMessages) {
      const msgId = msg.id!;

      // Anti-doublon
      const { data: existingLog } = await supabaseAdmin
        .from("automation_logs")
        .select("id")
        .eq("action", `invoice_scan_${msgId}`)
        .maybeSingle();
      if (existingLog) continue;

      const { data: fullMsg } = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "full",
      });

      const headers = fullMsg?.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from    = headers.find((h) => h.name === "From")?.value    || "";
      const date    = headers.find((h) => h.name === "Date")?.value    || "";

      // Skip emails Interac (déjà gérés par check-payments)
      if (from.includes("notify@payments.interac.ca")) continue;

      const rawBody = extractBody(fullMsg?.payload).substring(0, 3000);

      const aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Analyse cet email et dis-moi si c'est une facture/reçu d'achat business pour une entreprise d'entretien de piscines.

Email:
De: ${from}
Sujet: ${subject}
Date: ${date}
Corps: ${rawBody}

Réponds UNIQUEMENT en JSON valide (sans markdown):
{
  "isInvoice": true/false,
  "amount": number ou null,
  "vendor": "nom du fournisseur",
  "description": "description courte (max 80 chars)",
  "category": "materiel" | "essence" | "outils" | "marketing" | "telecom" | "repas" | "autre",
  "date": "YYYY-MM-DD"
}

Si ce n'est PAS une facture, retourne uniquement {"isInvoice": false}.`,
        }],
      });

      const rawText = (aiResponse.content[0] as { type: string; text: string }).text || "";
      const cleanText = rawText.replace(/```json|```/g, "").trim();

      let parsed: {
        isInvoice: boolean;
        amount?: number | null;
        vendor?: string;
        description?: string;
        category?: string;
        date?: string;
      };
      try { parsed = JSON.parse(cleanText); } catch { continue; }

      await supabaseAdmin.from("automation_logs").insert({
        action: `invoice_scan_${msgId}`,
        status: parsed.isInvoice ? "success" : "skipped",
        details: parsed,
      });

      if (!parsed.isInvoice || !parsed.amount) continue;

      const depenseDate = parsed.date || new Date().toISOString().split("T")[0];
      const depenseAnnee = parseInt(depenseDate.split("-")[0]);
      const categorie: CategorieDepense = CAT_MAP[parsed.category || ""] || "autre";
      const vendor = parsed.vendor || "";
      const desc = parsed.description || subject.substring(0, 120);
      const description = vendor ? `${vendor} — ${desc}`.substring(0, 255) : desc.substring(0, 255);

      const { error } = await supabaseAdmin.from("depenses").insert({
        date:        depenseDate,
        description,
        montant:     parsed.amount,
        categorie,
        annee:       depenseAnnee,
        source:      "gmail_auto",
        note:        `Détecté automatiquement · Sujet: ${subject.substring(0, 100)}`,
      });

      if (!error) {
        detected.push({ vendor, montant: parsed.amount, categorie });
      }
    }

    // Notifier Thomas si des factures ont été ajoutées
    if (detected.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
      const { data: thomas } = await supabaseAdmin
        .from("contacts").select("id").eq("phone", "+14509942215").single();

      if (thomas) {
        const total = detected.reduce((s, d) => s + d.montant, 0);
        const list  = detected.map(d => `${d.vendor} (${d.montant}$)`).join(", ");
        await fetch(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: thomas.id,
            body: `CHLORE: ${detected.length} facture(s) détectée(s) auto — ${total.toFixed(2)}$ total. ${list}`,
          }),
        }).catch(console.error);
      }
    }

    return NextResponse.json({ ok: true, detected: detected.length, items: detected });
  } catch (err) {
    console.error("[cron/scan-invoices]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
