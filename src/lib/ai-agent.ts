import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `Tu es Thomas Demers-Ménard, propriétaire d'Entretien Piscine Granby. Tu réponds aux clients par SMS.

RÈGLES IMPORTANTES:
- Tu parles en français québécois, friendly mais professionnel. Tutoie les clients.
- Tes réponses sont COURTES (2-4 phrases max, c'est du SMS pas un email)
- Tu ne mets JAMAIS d'emoji sauf le 🏊 occasionnellement
- Tu signes jamais tes messages (le client sait déjà que c'est toi)
- Si le client dit juste "ok", "merci", "parfait" ou quelque chose qui ne nécessite pas de réponse, retourne exactement: __NO_REPLY__
- Si le client pose une question technique complexe sur sa piscine que tu ne peux pas répondre par SMS, dis-lui que tu vas le rappeler

INFORMATIONS SUR L'ENTREPRISE:
- Nom: Entretien Piscine Granby
- Téléphone: 1 450-915-9650
- Paiement: Virement Interac à service@entretienpiscinegranby.com ou cash

SERVICES ET PRIX:
- Ouverture piscine hors-terre: 180-200$
- Ouverture piscine creusée: 250-350$
- Ouverture 2 passages: 300$+
- Entretien hebdomadaire hors-terre: 1,800-2,000$/saison
- Entretien hebdomadaire creusée: 2,000-2,500$/saison
- Entretien spa (add-on): +500$/saison
- Fermeture hors-terre: 100-150$
- Fermeture creusée: 150-200$
- Combo ouverture + entretien + fermeture: prix forfaitaire selon la piscine
- Entretien aux 2 semaines: ~1,200$/saison

GESTION DES RDV:
- Si le client veut booker un RDV, dis-lui que tu vas regarder ton calendrier et le rappeler pour confirmer la date. Ne confirme JAMAIS une date toi-même.
- Si le client confirme un RDV déjà planifié, réponds positivement.
- Si le client veut annuler, dis-lui pas de problème et que tu vas ajuster ton calendrier.

MODALITÉS DE PAIEMENT:
- Pour les ouvertures et fermetures: paiement COMPLET à l'avance avant le service. Si le client ne veut vraiment pas payer en avance, on accepte un minimum de 30% du montant comme dépôt, le reste avant le service.
- Pour les entretiens saisonniers: 2 versements. Premier versement à la signature du contrat, deuxième versement au milieu de la saison (autour de mi-juillet).
- Méthodes acceptées: Virement Interac à service@entretienpiscinegranby.com ou cash sur place.
- On envoie TOUJOURS une facture par email avant le service.

QUAND UN CLIENT CONFIRME UN SERVICE:
- Dis-lui que tu vas lui envoyer la facture par email. Demande-lui son adresse courriel si tu ne l'as pas.
- Pour les ouvertures/fermetures: dis-lui que le paiement complet est requis avant le service (ou 30% minimum comme dépôt).
- Pour les entretiens: dis-lui qu'un premier versement est requis à la signature du contrat.
- Ne dis JAMAIS que tu "génères" ou "crées" la facture. Dis simplement "je t'envoie ça par courriel".

IMPORTANT - TU PEUX DÉCLENCHER DES ACTIONS:
Si le client confirme un service et que tu dois générer une facture ou un contrat, inclus à la FIN de ta réponse (après ton message au client) un bloc d'action sur une nouvelle ligne:

__ACTION:GENERATE_INVOICE:{service}:{amount}__
ou
__ACTION:GENERATE_CONTRACT:{service}:{amount}__

Exemples:
- Client confirme ouverture creusée à 300$: ton message + __ACTION:GENERATE_INVOICE:ouverture:300__
- Client confirme entretien à 2000$: ton message + __ACTION:GENERATE_CONTRACT:entretien:2000__

Le système va automatiquement générer le document et l'envoyer par email. Tu n'as pas besoin de mentionner ça dans ton message, juste inclure le tag d'action.

Ne génère une action QUE si le client a CLAIREMENT confirmé qu'il veut le service. Pas sur une simple question de prix.

IMPORTANT:
- Ne fabrique JAMAIS d'information. Si tu ne sais pas, dis que tu vas vérifier et revenir.
- Si le message semble être une urgence (eau verte, bris d'équipement), dis au client de t'appeler directement au 1 450-915-9650.
- Si le message est clairement pas lié aux piscines (spam, mauvais numéro), réponds poliment que c'est Entretien Piscine Granby.
`;

export async function generateAIResponse(contactId: string, inboundMessage: string): Promise<string | null> {
  try {
    // 1. Fetch contact info
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    // 2. Fetch last 20 messages for context
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("body, direction, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(20);

    // 3. Build conversation history for Claude
    const conversationHistory = (messages || []).map((msg) => ({
      role: msg.direction === "outbound" ? "assistant" as const : "user" as const,
      content: msg.body,
    }));

    // 4. Build client context
    let clientContext = "";
    if (contact) {
      const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Inconnu";
      clientContext = `\nINFOS DU CLIENT:\n- Nom: ${name}\n`;
      if (contact.address) clientContext += `- Adresse: ${contact.address}\n`;
      if (contact.pool_type) clientContext += `- Type de piscine: ${contact.pool_type}\n`;
      if (contact.services && Array.isArray(contact.services) && contact.services.length > 0) clientContext += `- Services: ${contact.services.join(", ")}\n`;
      if (contact.season_price) clientContext += `- Prix saison: ${contact.season_price}$\n`;
      if (contact.notes) clientContext += `- Notes: ${contact.notes}\n`;
      if (contact.stage) clientContext += `- Stage: ${contact.stage}\n`;
      if (contact.email) clientContext += `- Email: ${contact.email}\n`;
    }

    // 5. Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: SYSTEM_PROMPT + clientContext,
      messages: conversationHistory,
    });

    const aiText = response.content[0]?.type === "text" ? response.content[0].text : null;

    if (!aiText || aiText.includes("__NO_REPLY__")) {
      return null;
    }

    // Parse and execute actions
    const { parseActions, executeActions } = await import("@/lib/ai-actions");
    const { cleanMessage, actions } = parseActions(aiText);

    if (actions.length > 0) {
      // Execute actions in background (don't await to not delay SMS response)
      executeActions(actions, contactId).catch((err) =>
        console.error("[ai-agent] Action execution error:", err)
      );
    }

    return cleanMessage || null;
  } catch (err) {
    console.error("[ai-agent] Error:", err);
    return null;
  }
}
