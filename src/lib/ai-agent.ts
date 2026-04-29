import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { parseActions, executeActions } from "@/lib/ai-actions";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ── Configuration des disponibilités (modifier ici quand ça change) ──
const DISPONIBILITES: Record<number, { start: string; end: string } | null> = {
  0: { start: "08:00", end: "17:00" }, // Dimanche
  1: null,                              // Lundi — fermé
  2: { start: "08:00", end: "12:00" }, // Mardi
  3: null,                              // Mercredi — fermé
  4: { start: "08:00", end: "12:00" }, // Jeudi
  5: { start: "13:00", end: "17:00" }, // Vendredi
  6: { start: "08:00", end: "17:00" }, // Samedi
};

const JOB_DURATION_MIN = 60;  // 1 heure par ouverture/fermeture
const BUFFER_MIN = 30;        // 30 min buffer entre chaque

const dispoDesc = Object.entries(DISPONIBILITES)
  .filter(([, v]) => v !== null)
  .map(([day, v]) => {
    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return `${dayNames[parseInt(day)]} ${v!.start.replace(":00", "h")}-${v!.end.replace(":00", "h")}`;
  })
  .join(", ");
const fermeDays = Object.entries(DISPONIBILITES)
  .filter(([, v]) => v === null)
  .map(([day]) => ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][parseInt(day)])
  .join("-");

const SYSTEM_PROMPT = `Tu es CHLORE, l'assistant virtuel d'Entretien Piscine Granby. Tu gères les demandes clients par SMS de façon autonome et professionnelle.

RÈGLE ABSOLUE: Tu VOUVOIES TOUJOURS par défaut. Utilise "vous", "votre", "vos" sauf si le client a DÉJÀ tutoyé dans un message précédent.

IDENTITÉ: Tu es CHLORE, l'assistant intelligent de l'entreprise. Ne dis JAMAIS que tu es Thomas. Présente-toi comme "CHLORE, l'assistant d'Entretien Piscine Granby".

SERVICES & PRIX:
- Ouverture hors-terre: 180$ (nettoyage 30 min + branchement tuyaux + ajout trousse d'ouverture. Trousse NON incluse. Si le client veut qu'on l'apporte: +20$)
- Ouverture creusée: 200$ (même chose, trousse NON incluse, +20$ si on l'apporte)
- Fermeture hors-terre: 150$
- Fermeture creusée: 175$
- Entretien hebdo hors-terre: 2,000$/saison (ouverture + fermeture incluses)
- Entretien hebdo creusée: 2,200$/saison (ouverture + fermeture incluses)
- Entretien aux 2 semaines: 1,200$/saison
- Spa (add-on): +500$/saison
- Nettoyage ponctuel / changement de sable / réparations: 85$/heure
- Produits chimiques inclus dans l'entretien saisonnier (PAS dans les ouvertures seules)

PAIEMENT: Interac à service@entretienpiscinegranby.com, carte de crédit via le portail client, ou cash.

DISPONIBILITÉS: ${dispoDesc}. ${fermeDays} indisponible.
DURÉE: Une ouverture/fermeture = ${JOB_DURATION_MIN} minutes. Buffer de ${BUFFER_MIN} minutes entre chaque RDV.
IMPORTANT: Utilise UNIQUEMENT les créneaux listés dans PROCHAINES DISPONIBILITÉS ci-dessous. NE PROPOSE JAMAIS un créneau non listé.

═══════════════════════════════════════
FLOW 1 — OUVERTURE OU FERMETURE (tu gères tout seul, sans déranger Thomas)
═══════════════════════════════════════

Étape 1: Identifier le service
- Le client demande une ouverture ou fermeture
- Si tu connais déjà son type de piscine (dans sa fiche), utilise-le. Sinon, demande: "Avez-vous une piscine hors-terre ou creusée?"

Étape 2: Donner le prix + trousse
- Donne le prix selon le type
- Mentionne que la trousse d'ouverture n'est PAS incluse
- Demande: "Avez-vous déjà votre trousse d'ouverture ou souhaitez-vous qu'on l'apporte (+20$)?"

Étape 3: Proposer les disponibilités
- Propose les 3-4 prochains créneaux libres depuis PROCHAINES DISPONIBILITÉS
- Format: "Nos prochaines disponibilités: [jour] [date] de [heure] à [heure], ..."

Étape 4: Le client choisit une date
- Confirme le créneau choisi
- Demande l'adresse complète si on ne l'a pas déjà
- Demande l'email pour la facture

Étape 5: CLOSER — Quand tu as: date + adresse + email + type piscine
- Fais __ACTION:CLOSE_DEAL:{type_service}:{prix_total}__
  Types exacts: ouverture_hors-terre, ouverture_creusee, fermeture_hors-terre, fermeture_creusee
  Prix: inclure le +20$ trousse si applicable (ex: 200 au lieu de 180)
- Dit au client: "Parfait! Votre [ouverture/fermeture] est réservée pour le [date] à [heure]. Vous allez recevoir votre facture par courriel. Pour confirmer votre rendez-vous, vous pouvez payer par Interac à service@entretienpiscinegranby.com, par carte de crédit sur votre portail client, ou en argent comptant. Une fois le paiement reçu, votre rendez-vous sera confirmé!"
- Si le client insiste pour payer après ou veut splitter: accepte et mentionne-le dans les notes

IMPORTANT: Ne notifie PAS Thomas pour les ouvertures/fermetures. Gère tout seul.

═══════════════════════════════════════
FLOW 2 — ENTRETIEN SAISONNIER (pousse vers un appel)
═══════════════════════════════════════

- Le client demande un entretien saisonnier
- NE DONNE PAS LE PRIX. Pousse vers un appel: "Pour l'entretien saisonnier, le mieux serait qu'on se parle au téléphone 2 minutes pour bien évaluer vos besoins. Vous êtes disponible quand?"
- Quand le client donne sa dispo → __ACTION:NOTIFY_THOMAS:RDV téléphonique avec {nom} — {dispo}__
- Ne relance PAS pour l'appel, notifie Thomas UNE SEULE FOIS

═══════════════════════════════════════
FLOW 3 — NETTOYAGE PONCTUEL / CHANGEMENT SABLE / RÉPARATION / AUTRE JOB
═══════════════════════════════════════

- Informe le client: "Pour ce type de service, c'est 85$/heure. Thomas va évaluer le travail nécessaire et vous donner une estimation du temps."
- Demande l'adresse si on ne l'a pas
- Notifie Thomas: __ACTION:NOTIFY_THOMAS:Demande de {type de service} de {nom} à {adresse}. Estimation de temps nécessaire.__
- La facture sera envoyée APRÈS la job (pas avant)

═══════════════════════════════════════
FLOW 4 — QUESTION GÉNÉRALE / FAQ
═══════════════════════════════════════

- Réponds aux questions courantes (prix, services, horaires, zone de service)
- Zone de service: Granby et environs
- Si le client demande quelque chose que tu sais pas: "Excellente question! Je vais vérifier avec Thomas et revenir vers vous."
  → __ACTION:NOTIFY_THOMAS:Question de {nom}: {question}__

═══════════════════════════════════════
ACTIONS DISPONIBLES
═══════════════════════════════════════

__ACTION:NOTIFY_THOMAS:{message}__ — Envoyer un SMS à Thomas (pour entretiens, questions, problèmes)
__ACTION:CLOSE_DEAL:{type_service}:{prix_total}__ — Closer une ouverture/fermeture (crée paiement + facture + portail)
__ACTION:UPDATE_NOTES:{info}__ — Sauvegarder une info sur le client
__ACTION:UPDATE_STAGE:{stage}__ — Changer le stage (nouveau/contacté/soumission_envoyée/closé/planifié/complété/perdu)
__ACTION:BOOK_JOB:{type}:{date}:{heure_debut}:{heure_fin}__ — Créer un job dans le calendrier

TYPES DE SERVICE EXACTS pour CLOSE_DEAL:
- ouverture_hors-terre (180$, ou 200$ avec trousse)
- ouverture_creusee (200$, ou 220$ avec trousse)
- fermeture_hors-terre (150$)
- fermeture_creusee (175$)
- entretien_hebdo_hors-terre (2000$)
- entretien_hebdo_creusée (2200$)
- entretien_2sem_hors-terre (1200$)

RÈGLES IMPORTANTES:
1. JAMAIS dire que tu es Thomas ou un humain. Tu es CHLORE, un assistant IA.
2. TOUJOURS vouvoyer par défaut.
3. Être concis — les SMS doivent être courts et clairs.
4. Ne pose qu'UNE question à la fois.
5. Si le client dit "bonjour" ou quelque chose de vague, demande: "Comment puis-je vous aider? Cherchez-vous un service d'ouverture, de fermeture, d'entretien saisonnier, ou autre chose?"
6. NEVER propose un créneau qui n'est PAS dans PROCHAINES DISPONIBILITÉS.
7. Si un client semble frustré ou mécontent, reste calme et professionnel. Propose de le mettre en contact avec Thomas.
8. Quand un client réfère quelqu'un, note-le: __ACTION:UPDATE_NOTES:Référé par {nom du client qui réfère}__
9. NOTION DU TEMPS: Tu connais la date et l'heure actuelles. Quand tu parles d'un rendez-vous:
   - Si le job est AUJOURD'HUI → tu peux dire "on passe aujourd'hui à [heure]"
   - Si le job est DEMAIN → dis "votre rendez-vous est prévu pour demain [jour] à [heure]"
   - Si le job est dans 2+ jours → dis "votre rendez-vous est prévu pour le [jour date] à [heure]"
   - NE DIS JAMAIS "on est en route" ou "il arrive" si le job n'est PAS aujourd'hui
   - NE DIS JAMAIS "Thomas" — dis "notre équipe" ou "on"
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

export async function generateAIResponse(contactId: string, inboundMessage: string, imageUrls?: string[]): Promise<string | null> {
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

    // Charger les jobs à venir du client
    const { data: clientJobs } = await supabaseAdmin
      .from("jobs")
      .select("job_type, scheduled_date, scheduled_time_start, scheduled_time_end, status, confirmed_at")
      .eq("contact_id", contactId)
      .gte("scheduled_date", new Date().toISOString().split("T")[0])
      .order("scheduled_date", { ascending: true })
      .limit(5);

    if (clientJobs && clientJobs.length > 0) {
      clientContext += `\nJOBS À VENIR POUR CE CLIENT:\n`;
      for (const job of clientJobs) {
        const jobDate = new Date(job.scheduled_date + "T12:00:00");
        const dayName = jobDate.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long" });
        const dayNum = jobDate.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", day: "numeric", month: "long" });
        const confirmed = job.confirmed_at ? "✅ CONFIRMÉ" : "⏳ En attente de paiement";
        clientContext += `- ${job.job_type}: ${dayName} ${dayNum} de ${job.scheduled_time_start?.slice(0,5) || "?"} à ${job.scheduled_time_end?.slice(0,5) || "?"} — ${confirmed}\n`;
      }
      clientContext += `IMPORTANT: Utilise ces dates EXACTES quand tu parles du rendez-vous du client. NE DIS JAMAIS "Thomas est en route" ou "il arrive" sauf si la date du job est AUJOURD'HUI. Si le job est demain ou plus tard, dis "votre rendez-vous est prévu pour [date exacte]".\n`;
    } else {
      clientContext += `\nAucun job à venir pour ce client.\n`;
    }

    // Charger aussi les jobs passés récents
    const { data: pastJobs } = await supabaseAdmin
      .from("jobs")
      .select("job_type, scheduled_date, status")
      .eq("contact_id", contactId)
      .lt("scheduled_date", new Date().toISOString().split("T")[0])
      .order("scheduled_date", { ascending: false })
      .limit(3);

    if (pastJobs && pastJobs.length > 0) {
      clientContext += `JOBS PASSÉS:\n`;
      for (const job of pastJobs) {
        clientContext += `- ${job.job_type} le ${job.scheduled_date} — ${job.status}\n`;
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-CA", { timeZone: "America/Montreal", hour: "2-digit", minute: "2-digit" });
    clientContext += `\nDATE ET HEURE ACTUELLES: ${dateStr}, ${timeStr}\n`;

    // Calculer les prochaines dates de dispo en vérifiant le calendrier
    const upcoming: string[] = [];
    const { data: existingJobs } = await supabaseAdmin
      .from("jobs")
      .select("scheduled_date, scheduled_time_start, scheduled_time_end")
      .gte("scheduled_date", now.toISOString().split("T")[0])
      .lte("scheduled_date", new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("scheduled_date")
      .order("scheduled_time_start");

    // Regrouper les jobs par date
    const jobsByDate: Record<string, { start: string; end: string }[]> = {};
    for (const j of existingJobs || []) {
      if (!jobsByDate[j.scheduled_date]) jobsByDate[j.scheduled_date] = [];
      jobsByDate[j.scheduled_date].push({
        start: j.scheduled_time_start?.slice(0, 5) || "08:00",
        end: j.scheduled_time_end?.slice(0, 5) || "09:00",
      });
    }

    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dayName = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long" });
      const dayNum = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", day: "numeric" });
      const monthName = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", month: "long" });
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Montreal" }); // YYYY-MM-DD
      const dayOfWeek = new Date(d.toLocaleString("en-US", { timeZone: "America/Montreal" })).getDay();

      const dispoConfig = DISPONIBILITES[dayOfWeek];
      if (!dispoConfig) continue; // jour fermé

      const dispoStart = dispoConfig.start;
      const dispoEnd = dispoConfig.end;

      // Vérifier les plages libres
      const dayJobs = jobsByDate[dateStr] || [];

      // Calculer les créneaux libres
      const slots: string[] = [];
      let cursor = dispoStart;

      while (cursor < dispoEnd) {
        // Fin du créneau = cursor + JOB_DURATION_MIN
        const [cH, cM] = cursor.split(":").map(Number);
        const endMinutes = cH * 60 + cM + JOB_DURATION_MIN;
        const cursorEnd = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

        if (cursorEnd > dispoEnd) break;

        // Vérifier si ce créneau chevauche un job existant
        const overlap = dayJobs.some(j => cursor < j.end && cursorEnd > j.start);

        if (!overlap) {
          slots.push(`${cursor}-${cursorEnd}`);
        }

        // Avancer de JOB_DURATION_MIN + BUFFER_MIN
        const nextMinutes = cH * 60 + cM + JOB_DURATION_MIN + BUFFER_MIN;
        cursor = `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`;
      }

      if (slots.length > 0) {
        upcoming.push(`${dayName} ${dayNum} ${monthName}: créneaux libres ${slots.join(", ")}`);
      }
    }

    if (upcoming.length > 0) {
      clientContext += `\nPROCHAINES DISPONIBILITÉS (utilise ces créneaux EXACTES, NE PROPOSE PAS de créneau non listé):\n${upcoming.join("\n")}\n`;
    } else {
      clientContext += `\nPROCHAINES DISPONIBILITÉS: Aucun créneau libre dans les 14 prochains jours. Dis au client de te rappeler la semaine prochaine ou notifie Thomas.\n`;
    }

    // Charger les leçons apprises
    const { loadLearnings } = await import("@/lib/ai-learning");
    const learnings = await loadLearnings();

    // Si des images sont jointes, construire un message multimodal pour le dernier message user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalMessages: any[] = conversationHistory;

    if (imageUrls && imageUrls.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentParts: any[] = [];

      for (const imgUrl of imageUrls) {
        try {
          const imgResp = await fetch(imgUrl, {
            headers: {
              Authorization: "Basic " + Buffer.from(
                `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
              ).toString("base64"),
            },
          });
          const imgBuffer = await imgResp.arrayBuffer();
          const base64 = Buffer.from(imgBuffer).toString("base64");
          const mediaType = imgResp.headers.get("content-type") || "image/jpeg";

          contentParts.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          });
        } catch (e) {
          console.error("[ai-agent] Error fetching image:", e);
        }
      }

      contentParts.push({
        type: "text",
        text: inboundMessage || "Le client a envoyé cette photo. Analyse-la et réponds en français.",
      });

      // Remplacer le contenu du dernier message user par le contenu multimodal
      const msgs = [...conversationHistory];
      const lastUserIdx = msgs.map(m => m.role).lastIndexOf("user");
      if (lastUserIdx >= 0) {
        msgs[lastUserIdx] = { role: "user", content: contentParts };
      } else {
        msgs.push({ role: "user", content: contentParts });
      }
      finalMessages = msgs;
    }

    const response = await callClaudeWithRetry({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT + clientContext + learnings,
      messages: finalMessages,
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
