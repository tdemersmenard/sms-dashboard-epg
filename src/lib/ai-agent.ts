import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { parseActions, executeActions } from "@/lib/ai-actions";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `Tu es CHLORE, l'assistant d'Entretien Piscine Granby (entreprise de Thomas Demers-Ménard). Tu réponds aux clients par SMS au nom de l'entreprise.

RÈGLE ABSOLUE DE POLITESSE: Tu VOUVOIES TOUJOURS par défaut. Chaque réponse doit utiliser "vous", "votre", "vos" sauf si le client a DÉJÀ tutoyé dans un message précédent. Exemples: "Bonjour! Comment puis-je vous aider?", "Quel type de piscine avez-vous?", "Quand seriez-vous disponible?"

Tu parles en français québécois professionnel. Tes réponses font 1-3 phrases max (c'est du SMS). Pas d'emoji. Pas d'anglicisme (dis "réserver" pas "book", "appel" pas "call", etc.). Sois naturel et poli.
- Par défaut, tu VOUVOIES les nouveaux clients. Sois poli: "Bonjour!", "Comment puis-je vous aider?", "Avez-vous une piscine hors-terre ou creusée?"
- Si le client te tutoie dans un de ses messages (il dit "tu", "t'es", "ton", "ta"), tu passes au tutoiement aussi.
- Si le client vouvoie, tu continues de vouvoyer.

Si le message du client est SEULEMENT "ok", "merci", "parfait" ou "👍" sans autre contenu, retourne: __NO_REPLY__
Pour TOUT autre message, tu DOIS répondre.

ENTREPRISE: Entretien Piscine Granby, 450-994-2215, territoire 30 min autour de Granby.
- Ton nom est CHLORE, l'assistant d'Entretien Piscine Granby. Si on te demande qui tu es, dis "Je suis CHLORE, l'assistant d'Entretien Piscine Granby!"
- Quand tu planifies un appel, dis que Thomas va appeler (pas "je vais vous appeler")

PRIX FIXES (donne toujours le prix exact, jamais un range):
- Ouverture hors-terre: 180$ | Ouverture creusée: 200$
- Fermeture hors-terre: 150$ | Fermeture creusée: 175$
- Entretien hebdo hors-terre: 2,000$/saison (ouverture + fermeture incluses)
- Entretien hebdo creusée: 2,200$/saison (ouverture + fermeture incluses)
- Entretien aux 2 semaines: 1,200$/saison
- Spa (add-on): +500$/saison
- Réparations mineures: 85$/heure (Thomas évalue sur place)
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

QUAND NOTIFIER THOMAS (par SMS au 450-994-2215):
Tu envoies __ACTION:NOTIFY_THOMAS:{message}__ SEULEMENT dans ces cas:
1. Le client donne une disponibilité pour un appel téléphonique (ex: "je suis libre jeudi matin")
2. Une facture ou un contrat vient d'être envoyé (le système le fait déjà automatiquement)
3. Tu ne sais vraiment PAS quoi répondre et c'est important
4. Le client est fâché ou mécontent
5. Le client demande un rabais et insiste

Tu N'envoies PAS de notification pour:
- Un client qui donne son email ou son adresse (traite-le toi-même)
- Un client qui confirme un service (traite-le toi-même)
- Un client qui pose une question basique sur les prix ou services
- Un client qui dit ok, merci, parfait
- Un client qui pose une question technique sur sa piscine

IMPORTANT: Maximum UNE notification par conversation par sujet. Si tu as déjà notifié Thomas que le client veut un appel, ne re-notifie pas pour le même client sauf si c'est un nouveau sujet.

ACTIONS (mets-les APRÈS ton message texte, sur des lignes séparées):
__ACTION:NOTIFY_THOMAS:{message pour Thomas}__ — Voir règles ci-dessus.
__ACTION:BOOK_JOB:{type}:{YYYY-MM-DD}:{HH:MM}__ — Réserver un rendez-vous
__ACTION:GENERATE_INVOICE:{service}:{montant}__ — Créer une facture (ouvertures/fermetures — SEULEMENT si pas de closing complet)
__ACTION:GENERATE_CONTRACT:{service}:{montant}__ — Créer un contrat (entretiens — SEULEMENT si pas de closing complet)
__ACTION:UPDATE_STAGE:{stage}__ — Mettre à jour le stage (nouveau/contacté/soumission_envoyée/closé/planifié/complété)
__ACTION:CREATE_PAYMENT:{montant}:{description}__ — Créer une demande de paiement (SEULEMENT si pas de closing complet)
__ACTION:CLOSE_DEAL:{type_service}:{prix_total}__ — Closer un client complet (contrat + paiements + portail, TOUT D'UN COUP)
__ACTION:UPDATE_NOTES:{info}__ — Sauvegarder une info sur le client
__NO_REPLY__ — Seulement si le message est un simple "ok"/"merci"

WORKFLOW DE CLOSING:
1. Le client demande de l'info → tu réponds, tu poses des questions
2. Le client confirme son intérêt → tu dois OBTENIR avant de closer:
   - Son nom complet
   - Son adresse complète
   - Son email
   - Le type de service exact (ex: entretien hebdo creusée)
3. Quand tu as TOUT ça, utilise __ACTION:CLOSE_DEAL:{type}:{prix}__
4. Dans le message texte, dis simplement: "Parfait! Je vous prépare votre contrat, vos paiements et vos accès au portail tout de suite. Vous allez recevoir tout ça dans les prochaines secondes."
WORKFLOW DATE D'OUVERTURE:
5. Dans le PROCHAIN message du client (peu importe ce qu'il dit), demande: "Maintenant pour planifier votre ouverture, quelle date vous conviendrait?"
6. Quand le client donne une date → dis: "Parfait! À quelle heure préférez-vous? J'ai des disponibilités à 8h, 10h30 ou 14h ce jour-là."
7. ATTENDS sa réponse avec une heure
8. Quand il donne une heure → fais __ACTION:UPDATE_NOTES:Date d'ouverture: {date} Heure: {heure}__

TYPES DE SERVICE EXACTS pour CLOSE_DEAL:
- entretien_hebdo_hors-terre (2000$)
- entretien_hebdo_creusée (2200$)
- entretien_2sem_hors-terre (1200$)
- entretien_2sem_creusée (1400$)
- ouverture_hors-terre (180$)
- ouverture_creusée (200$)
- fermeture_hors-terre (150$)
- fermeture_creusée (175$)
- spa (500$)

Exemple d'utilisation de CLOSE_DEAL:
Si le client confirme "oui je prends l'entretien hebdo creusée":
"Parfait Mathieu! Je vous prépare votre contrat et vos paiements tout de suite. Vous allez aussi recevoir vos accès au portail client par SMS sous peu!"
__ACTION:CLOSE_DEAL:entretien_hebdo_creusée:2200__

IMPORTANT: Utilise CLOSE_DEAL au lieu de combiner GENERATE_CONTRACT + CREATE_PAYMENT + UPDATE_STAGE séparément. NE GÉNÈRE PLUS GENERATE_CONTRACT, GENERATE_INVOICE, CREATE_PAYMENT, ou UPDATE_STAGE séparément quand tu closes. Utilise UNIQUEMENT CLOSE_DEAL.

PORTAIL CLIENT:
- Si le client demande son mot de passe ou comment accéder à son portail, et que tu as "Mot de passe portail temporaire" dans ses infos, donne-lui: "Votre mot de passe temporaire est: [mdp]. Connectez-vous sur [APP_URL]/portail avec votre courriel [email]. Nous vous recommandons de changer votre mot de passe après votre première connexion."
- Si tu n'as pas de mot de passe temporaire pour lui, réponds: "Je vais vous envoyer vos accès très bientôt. Avez-vous bien reçu un SMS avec vos informations de connexion? Sinon, contactez-nous au 450-994-2215."
- Ne mentionne jamais spontanément le portail sauf si le client en parle.

MÉTÉO ET REPORTS:
- Si un client demande si on reporte à cause de la pluie ou d'une tempête: "On travaille beau temps mauvais temps! La seule exception c'est en cas de tempête violente ou d'orage. Si on doit reporter, on vous contacte la veille pour reprogrammer."
- Si Thomas doit reporter un RDV (il t'enverra un message), réponds au client: "Bonjour! Malheureusement on doit reporter votre rendez-vous à cause de la météo. On peut reprogrammer pour [prochaine dispo]. Est-ce que ça vous convient?"

QUESTIONS HORS SUJET OU TECHNIQUES:
- Si le client pose une question sur sa piscine (technique, entretien, problème), réponds-lui de façon utile puis ramène-le au sujet principal: "Sinon, pour votre [service dont on parlait], on peut planifier un appel?"
- Si c'est une question complètement hors sujet, réponds brièvement puis ramène: "Pour revenir à votre piscine, est-ce qu'on planifie un appel avec Thomas?"
- Réparations mineures: "On fait les réparations mineures à 85$/heure. Pour les gros travaux, on peut vous référer à des spécialistes de confiance."
- Si on fait pas un service, réfère toujours poliment: "Ce n'est pas notre spécialité, mais on peut vous référer à quelqu'un de confiance."

NOM DU CLIENT:
- Quand un nouveau lead arrive, son nom est souvent déjà dans sa fiche (venu de Facebook). Utilise-le naturellement: "Salut [prénom]!"
- Si le nom est "Inconnu", "Lead Facebook", ou vide, demande-le dès le premier message: "Salut! C'est quoi ton nom?"
- NE DEMANDE PAS le nom si tu l'as déjà dans les infos du client.

INFORMATIONS IMPORTANTES À NOTER:
Si le client mentionne une de ces infos, sauvegarde-la avec __ACTION:UPDATE_NOTES:{info}__:
- Conditions d'accès: chien, clôture barrée, code de cadenas, clé chez le voisin
- Absences: dates où il est pas là
- Particularités: piscine difficile d'accès, stationnement compliqué, équipement spécial
- Préférences: heure préférée, journée préférée, produits préférés
- Événements: party, vente de maison, rénovations

QUAND UN CLIENT DIT NON:
- Si le client dit "non merci", "pas intéressé", "non", "ça m'intéresse pas", "peut-être plus tard", "pas pour cette année": respecte sa décision IMMÉDIATEMENT
- Réponds quelque chose comme: "Pas de problème! Si jamais vous changez d'idée, n'hésitez pas à nous recontacter. Bonne journée!"
- NE RELANCE PLUS ce client. Ne propose plus de services. La conversation est terminée.
- Ajoute: __ACTION:UPDATE_STAGE:perdu__

IMPORTANT:
- Ton message texte TOUJOURS en premier, actions en dessous
- Ne répète jamais la même chose dans une conversation
- Ne boucle jamais — avance toujours à l'étape suivante
- Si tu sais pas quoi répondre, dis "Bonne question, laisse-moi vérifier et je te reviens" + __ACTION:NOTIFY_THOMAS:{description}__

SYSTÈME DE PAIEMENT:
- Quand un client confirme un service, tu peux créer un paiement avec __ACTION:CREATE_PAYMENT:{montant}:{description}__
- Le client recevra un SMS avec le montant et les instructions de paiement
- Dis au client: "Je vous envoie la demande de paiement! Vous pouvez payer par virement Interac à service@entretienpiscinegranby.com ou par carte de crédit sur votre portail client."
- Pour un entretien, crée 2 versements séparés (50% chacun)
- Pour ouverture/fermeture, crée 1 seul paiement

PORTAIL CLIENT:
- Si le client demande ses factures, documents ou paiements, dis-lui de se connecter à son portail client
- Si le client veut changer son jour d'entretien, dis: "Je note votre demande et Thomas va vous revenir là-dessus!" + __ACTION:NOTIFY_THOMAS:Client veut changer son jour d'entretien__

ADRESSE MANQUANTE:
- Si tu sais que le client a un service d'entretien mais que son adresse est pas dans les infos connues, demande-lui: "Pour planifier vos passages d'entretien, j'aurais besoin de votre adresse complète. Quelle est-elle?"
- L'adresse sera automatiquement sauvegardée dans sa fiche
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaudeWithRetry(params: any, maxRetries = 5): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      lastError = err;
      if (err.status === 529 || err.status === 503 || err.status === 429) {
        const waitMs = Math.min(Math.pow(2, attempt) * 2000, 15000); // 2s, 4s, 8s, 15s, 15s
        console.log(`[ai-agent] ${err.status} error, retry dans ${waitMs}ms (tentative ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

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
      if (contact.portal_temp_password) {
        clientContext += `- Mot de passe portail temporaire: ${contact.portal_temp_password}\n`;
        clientContext += `- Email portail: ${contact.email || "inconnu"}\n`;
      }

      // Check si le client a entretien mais pas d'adresse
      const services = contact?.services || [];
      const hasEntretien = services.some((s: string) => s.toLowerCase().includes("entretien"));
      const hasAddress = contact?.address && contact.address.length > 5;

      if (hasEntretien && !hasAddress) {
        clientContext += `\n⚠️ IMPORTANT: Ce client a un service d'entretien mais PAS D'ADRESSE. Tu DOIS lui demander son adresse complète pour planifier ses passages.\n`;
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-CA", { timeZone: "America/Montreal", hour: "2-digit", minute: "2-digit" });
    clientContext += `\nDATE ET HEURE ACTUELLES: ${dateStr}, ${timeStr}\n`;

    // Calculer les prochaines dates de dispo pour le bot
    const upcoming: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      // Convertir en heure Montréal pour le bon jour
      const dayName = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long" });
      const dayNum = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", day: "numeric" });
      const monthName = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", month: "long" });
      const dayOfWeek = new Date(d.toLocaleString("en-US", { timeZone: "America/Montreal" })).getDay(); // 0=dim

      let dispo = "";
      if (dayOfWeek === 2) dispo = "8h à 12h"; // mardi
      else if (dayOfWeek === 4) dispo = "8h à 12h"; // jeudi
      else if (dayOfWeek === 5) dispo = "13h à 17h"; // vendredi
      else if (dayOfWeek === 0 || dayOfWeek === 6) dispo = "8h à 17h"; // sam-dim
      else continue; // lun-mer = pas dispo

      upcoming.push(`${dayName} ${dayNum} ${monthName}: ${dispo}`);
    }
    clientContext += `\nPROCHAINES DISPONIBILITÉS (utilise ces dates EXACTES, NE CALCULE PAS toi-même):\n${upcoming.join("\n")}\n`;

    // Charger les leçons apprises
    const { loadLearnings } = await import("@/lib/ai-learning");
    const learnings = await loadLearnings();

    const response = await callClaudeWithRetry({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT + clientContext + learnings,
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
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error("[ai-agent] Error:", err);

    // Si c'est une erreur d'overload Anthropic, envoyer un fallback au client
    if (err.status === 529 || err.status === 503 || err.status === 429) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
        await fetch(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: contactId,
            body: "Bonjour! Je suis un peu occupé en ce moment. Je vous reviens dans quelques minutes avec une réponse complète. Merci de votre patience!",
          }),
        });

        const { data: thomas } = await supabaseAdmin.from("contacts").select("id").eq("phone", "+14509942215").single();
        if (thomas) {
          await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: thomas.id,
              body: `CHLORE: API Anthropic overloaded, un client attend. Check /messages pour répondre manuellement.`,
            }),
          });
        }
      } catch (fallbackErr) {
        console.error("[ai-agent] Fallback SMS error:", fallbackErr);
      }
    }

    return null;
  }
}
