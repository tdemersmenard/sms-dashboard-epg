export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { command } = await req.json();
    if (!command) return NextResponse.json({ error: "No command" }, { status: 400 });

    // Fetch all contacts for context
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, email, stage, season_price")
      .order("updated_at", { ascending: false })
      .limit(100);

    const contactList = (contacts || []).map(c =>
      `${c.id} | ${[c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone} | ${c.phone} | ${c.email || "pas d'email"} | stage: ${c.stage}`
    ).join("\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `Tu es un assistant qui exécute des commandes pour Thomas, propriétaire d'Entretien Piscine Granby.

Thomas te donne une instruction en langage naturel. Tu dois:
1. Comprendre ce qu'il veut faire
2. Identifier le ou les contacts concernés dans la liste
3. Retourner un JSON avec les actions à exécuter

CONTACTS DISPONIBLES:
${contactList}

Réponds UNIQUEMENT en JSON valide:
{
  "understood": true,
  "summary": "Ce que tu vas faire en une phrase",
  "actions": [
    {
      "type": "SEND_SMS",
      "contactId": "uuid du contact",
      "contactName": "nom du contact",
      "message": "le message SMS à envoyer"
    },
    {
      "type": "CREATE_REMINDER",
      "contactId": "uuid",
      "contactName": "nom",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "description": "description du rappel"
    },
    {
      "type": "GENERATE_INVOICE",
      "contactId": "uuid",
      "contactName": "nom",
      "service": "description du service",
      "amount": 180
    },
    {
      "type": "GENERATE_CONTRACT",
      "contactId": "uuid",
      "contactName": "nom",
      "service": "description du service",
      "amount": 2000
    },
    {
      "type": "UPDATE_STAGE",
      "contactId": "uuid",
      "contactName": "nom",
      "stage": "nouveau|contacté|soumission_envoyée|closé|planifié|complété|perdu"
    }
  ]
}

IMPORTANT: Quand Thomas dit 'relance' ou 'relancer', ça veut dire envoyer un SMS au contact. Tu dois:
1. Si c'est pour maintenant ou aujourd'hui → type SEND_SMS avec un message de relance approprié
2. Si c'est pour plus tard (demain, vendredi, etc.) → type SEND_SMS_LATER avec la date, l'heure, le message et le contactId

Pour SEND_SMS_LATER, retourne:
{
  "type": "SEND_SMS_LATER",
  "contactId": "uuid",
  "contactName": "nom",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "message": "le SMS de relance à envoyer",
  "description": "description du rappel"
}

Pour le contenu du message de relance, adapte selon le contexte que Thomas donne. Exemples:
- 'relance Caleb pour le paiement' → 'Bonjour Caleb! Je fais un petit suivi concernant votre paiement. Avez-vous eu le temps de faire le virement? N'hésitez pas si vous avez des questions!'
- 'relance Marc-André pour la soumission' → 'Bonjour Marc-André! Je voulais faire un suivi concernant notre discussion pour l'entretien de piscine. Avez-vous eu le temps d'y réfléchir?'
- 'relance Philippe pour confirmer le RDV' → 'Bonjour Philippe! Je voulais confirmer votre rendez-vous prévu prochainement. Est-ce que ça tient toujours?'

Si tu ne trouves pas le contact mentionné, retourne:
{"understood": false, "summary": "Je n'ai pas trouvé le contact [nom]. Peux-tu préciser?", "actions": []}

Si la commande n'est pas claire, retourne:
{"understood": false, "summary": "Je n'ai pas compris. Peux-tu reformuler?", "actions": []}

PRIX DE RÉFÉRENCE:
- Ouverture hors-terre: 180$ | Creusée: 200$
- Fermeture hors-terre: 150$ | Creusée: 175$
- Entretien hebdo hors-terre: 2000$ | Creusée: 2200$
- Entretien aux 2 semaines: 1200$

Pour les dates relatives: "demain" = ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}, "après-demain" = ${new Date(Date.now() + 172800000).toISOString().split("T")[0]}
Aujourd'hui = ${new Date().toISOString().split("T")[0]}`,
      messages: [{ role: "user", content: command }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.understood) {
      return NextResponse.json(parsed);
    }

    // Exécuter les actions
    const results = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

    for (const action of parsed.actions || []) {
      try {
        switch (action.type) {
          case "SEND_SMS": {
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId: action.contactId, body: action.message }),
            });
            results.push(`SMS envoyé à ${action.contactName}`);
            break;
          }
          case "CREATE_REMINDER": {
            await supabaseAdmin.from("jobs").insert({
              contact_id: action.contactId,
              job_type: "autre",
              scheduled_date: action.date,
              scheduled_time_start: action.time || "09:00",
              notes: action.description,
              status: "planifié",
            });
            results.push(`Rappel créé: ${action.description} le ${action.date}`);
            break;
          }
          case "GENERATE_INVOICE": {
            const { count } = await supabaseAdmin
              .from("documents")
              .select("id", { count: "exact", head: true })
              .eq("doc_type", "facture");
            const docNumber = `F-2026-${String((count || 0) + 1).padStart(3, "0")}`;

            await supabaseAdmin.from("documents").insert({
              contact_id: action.contactId,
              doc_type: "facture",
              doc_number: docNumber,
              amount: action.amount,
              status: "brouillon",
              data: { service: action.service, client_name: action.contactName },
            });
            results.push(`Facture ${docNumber} créée pour ${action.contactName}: ${action.amount}$`);
            break;
          }
          case "GENERATE_CONTRACT": {
            const { count } = await supabaseAdmin
              .from("documents")
              .select("id", { count: "exact", head: true })
              .eq("doc_type", "contrat");
            const docNumber = `C-2026-${String((count || 0) + 1).padStart(3, "0")}`;

            await supabaseAdmin.from("documents").insert({
              contact_id: action.contactId,
              doc_type: "contrat",
              doc_number: docNumber,
              amount: action.amount,
              status: "brouillon",
              data: { service: action.service, client_name: action.contactName },
            });
            results.push(`Contrat ${docNumber} créé pour ${action.contactName}: ${action.amount}$`);
            break;
          }
          case "UPDATE_STAGE": {
            await supabaseAdmin.from("contacts")
              .update({ stage: action.stage })
              .eq("id", action.contactId);
            results.push(`${action.contactName} passé à "${action.stage}"`);
            break;
          }
          case "SEND_SMS_LATER": {
            await supabaseAdmin.from("jobs").insert({
              contact_id: action.contactId,
              job_type: "autre",
              scheduled_date: action.date,
              scheduled_time_start: action.time || "09:00",
              notes: `AUTO_SMS:${action.message}`,
              status: "planifié",
            });
            results.push(`Relance programmée pour ${action.contactName} le ${action.date} à ${action.time || "09:00"}`);
            break;
          }
        }
      } catch (err) {
        results.push(`Erreur pour ${action.contactName}: ${err}`);
      }
    }

    return NextResponse.json({
      understood: true,
      summary: parsed.summary,
      actions: parsed.actions,
      results,
    });
  } catch (err) {
    console.error("[ai-command] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
