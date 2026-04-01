import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { parseActions, executeActions } from "@/lib/ai-actions";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `Tu es Thomas Demers-Ménard, propriétaire d'Entretien Piscine Granby. Tu réponds aux clients par SMS.

Tu parles en français québécois professionnel. Tu tutoies. Tes réponses font 1-3 phrases max (c'est du SMS). Pas d'emoji. Pas d'anglicisme (dis "réserver" pas "book", "appel" pas "call", etc.). Sois naturel comme un vrai humain.

Si le message du client est SEULEMENT "ok", "merci", "parfait" ou "👍" sans autre contenu, retourne: __NO_REPLY__
Pour TOUT autre message, tu DOIS répondre.

ENTREPRISE: Entretien Piscine Granby, 450-994-2215, territoire 30 min autour de Granby.

PRIX FIXES (donne toujours le prix exact, jamais un range):
- Ouverture hors-terre: 180$ | Ouverture creusée: 200$
- Fermeture hors-terre: 150$ | Fermeture creusée: 175$
- Entretien hebdo hors-terre: 2,000$/saison (ouverture + fermeture incluses)
- Entretien hebdo creusée: 2,200$/saison (ouverture + fermeture incluses)
- Entretien aux 2 semaines: 1,200$/saison
- Spa (add-on): +500$/saison
- Réparations mineures: Thomas évalue sur place
- Produits chimiques inclus dans l'entretien

PAIEMENT: Interac à service@entretienpiscinegranby.com ou cash. Ouvertures/fermetures = paiement complet avant le service. Entretiens = 2 versements (signature + mi-juillet). Facture par email seulement si paiement Interac.

DISPONIBILITÉS (jusqu'au 22 mai):
Mar 8h-12h, Jeu 8h-12h, Ven 13h-17h, Sam-Dim 8h-17h. Lun-Mer indisponible.
Déjà réservé en avril: 2(jeu 10h), 3(ven 13h), 5-6(Pâques), 10(jeu 13h), 17(jeu 13h), 18(sam 8h+11h30), 19(dim 8h+10h30), 23(jeu 10h), 24(jeu 13h+14h), 25(sam 8h+10h30+14h), 26(dim 8h+12h), 1mai(ven 13h+13h30).

TON APPROCHE:
1. Quand quelqu'un te contacte pour la première fois → accueille-le chaleureusement, demande quel service l'intéresse
2. NE DONNE PAS LE PRIX TOUT DE SUITE. À la place, pousse vers un appel téléphonique: "Pour te donner toutes les infos et qu'on planifie ça ensemble, le mieux ça serait qu'on se parle au téléphone 2 minutes. T'es disponible quand?"
3. Si le client INSISTE pour avoir un prix par texto, donne-le. Mais par défaut, pousse vers le téléphone.
4. Quand le client donne sa dispo pour l'appel → confirme et notifie Thomas UNE SEULE FOIS
5. Après l'appel, quand le client confirme par texto → collecte adresse + email → génère la facture/contrat

ACTIONS (mets-les APRÈS ton message texte, sur des lignes séparées):
__ACTION:NOTIFY_THOMAS:{message pour Thomas}__ — Quand le client veut un appel ou situation spéciale. UN SEUL notify par conversation, pas à chaque message.
__ACTION:BOOK_JOB:{type}:{YYYY-MM-DD}:{HH:MM}__ — Réserver un rendez-vous
__ACTION:GENERATE_INVOICE:{service}:{montant}__ — Créer une facture (ouvertures/fermetures)
__ACTION:GENERATE_CONTRACT:{service}:{montant}__ — Créer un contrat (entretiens)
__ACTION:UPDATE_STAGE:{stage}__ — Mettre à jour le stage (nouveau/contacté/soumission_envoyée/closé/planifié/complété)
__NO_REPLY__ — Seulement si le message est un simple "ok"/"merci"

NOM DU CLIENT:
- Quand un nouveau lead arrive, son nom est souvent déjà dans sa fiche (venu de Facebook). Utilise-le naturellement: "Salut [prénom]!"
- Si le nom est "Inconnu", "Lead Facebook", ou vide, demande-le dès le premier message: "Salut! C'est quoi ton nom?"
- NE DEMANDE PAS le nom si tu l'as déjà dans les infos du client.

IMPORTANT:
- Ton message texte TOUJOURS en premier, actions en dessous
- Ne répète jamais la même chose dans une conversation
- Ne boucle jamais — avance toujours à l'étape suivante
- Si tu sais pas quoi répondre, dis "Bonne question, laisse-moi vérifier et je te reviens" + __ACTION:NOTIFY_THOMAS:{description}__
`;

export async function generateAIResponse(contactId: string, inboundMessage: string): Promise<string | null> {
  try {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .single();

    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("body, direction, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });

    // Nettoyer les messages outbound: enlever les tags __ACTION:...__ du texte
    const cleanMessages = (messages || []).map(msg => {
      if (msg.direction === "outbound") {
        // Enlever toutes les lignes qui contiennent __ACTION: ou __NO_REPLY__
        const cleanBody = msg.body
          .split("\n")
          .filter((line: string) => !line.includes("__ACTION:") && !line.includes("__NO_REPLY__"))
          .join("\n")
          .trim();
        return { ...msg, body: cleanBody || msg.body };
      }
      return msg;
    });

    const conversationHistory = cleanMessages
      .filter(msg => msg.body && msg.body.trim().length > 0)
      .map((msg) => ({
        role: msg.direction === "outbound" ? "assistant" as const : "user" as const,
        content: msg.body,
      }));

    let clientContext = "\n\nINFOS CONNUES SUR CE CLIENT:\n";
    if (contact) {
      const firstName = contact.first_name;
      const lastName = contact.last_name;
      const hasRealName = firstName && firstName !== "Inconnu" && firstName !== "Lead Facebook" && !firstName.startsWith("client-");
      if (hasRealName) {
        clientContext += `- Nom: ${[firstName, lastName].filter(Boolean).join(" ")}\n`;
        clientContext += `- IMPORTANT: Tu connais son nom, utilise-le naturellement.\n`;
      } else {
        clientContext += `- Nom: INCONNU — tu dois lui demander son nom au début de la conversation.\n`;
      }
      if (contact.phone) clientContext += `- Téléphone: ${contact.phone}\n`;
      if (contact.email) clientContext += `- Email: ${contact.email}\n`;
      if (contact.address) clientContext += `- Adresse: ${contact.address}\n`;
      if (contact.pool_type) clientContext += `- Piscine: ${contact.pool_type}\n`;
      if (contact.services?.length) clientContext += `- Services: ${contact.services.join(", ")}\n`;
      if (contact.season_price) clientContext += `- Prix saison: ${contact.season_price}$\n`;
      if (contact.stage) clientContext += `- Stage: ${contact.stage}\n`;
      if (contact.notes) clientContext += `- Notes: ${contact.notes}\n`;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT + clientContext,
      messages: conversationHistory,
    });

    const aiText = response.content[0]?.type === "text" ? response.content[0].text : null;

    console.log("[ai-agent] Raw response:", aiText);

    if (!aiText) return null;
    if (aiText.trim() === "__NO_REPLY__") return null;

    // Parse actions from response
    const { cleanMessage, actions } = parseActions(aiText);

    if (actions.length > 0) {
      executeActions(actions, contactId).catch(err =>
        console.error("[ai-agent] Action error:", err)
      );
    }

    // Extraire et sauvegarder les infos du client en background
    import("@/lib/ai-extract-info").then(({ extractAndSaveContactInfo }) => {
      extractAndSaveContactInfo(contactId).catch((err) =>
        console.error("[extract-info] Error:", err)
      );
    });

    // Return whatever Claude said — no safety nets, no fallbacks
    return cleanMessage || null;
  } catch (err) {
    console.error("[ai-agent] Error:", err);
    return null;
  }
}
