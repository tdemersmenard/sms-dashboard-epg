import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { parseActions, executeActions, BUYER_PROFILES } from "@/lib/ai-actions";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Dispos pendant le cégep (jusqu'au 13 mai 2026)
const DISPOS_CEGEP: Record<number, { start: string; end: string } | null> = {
  0: { start: "08:00", end: "17:00" }, // Dimanche
  1: null,                              // Lundi — fermé
  2: { start: "08:00", end: "12:00" }, // Mardi
  3: null,                              // Mercredi — fermé
  4: { start: "08:00", end: "12:00" }, // Jeudi
  5: { start: "13:00", end: "17:00" }, // Vendredi
  6: { start: "08:00", end: "17:00" }, // Samedi
};

// Dispos après le cégep (à partir du 14 mai 2026)
const DISPOS_NORMAL: Record<number, { start: string; end: string } | null> = {
  0: null,                              // Dimanche — fermé
  1: { start: "08:00", end: "17:00" }, // Lundi
  2: { start: "08:00", end: "17:00" }, // Mardi
  3: { start: "08:00", end: "17:00" }, // Mercredi
  4: { start: "08:00", end: "17:00" }, // Jeudi
  5: { start: "08:00", end: "17:00" }, // Vendredi
  6: null,                              // Samedi — fermé
};

const CEGEP_END_DATE = "2026-05-13";

function getDispos(dateStr: string): Record<number, { start: string; end: string } | null> {
  return dateStr > CEGEP_END_DATE ? DISPOS_NORMAL : DISPOS_CEGEP;
}

const JOB_DURATION_MIN = 60;  // 1 heure par ouverture/fermeture
const BUFFER_MIN = 45;        // 45 min buffer pour déplacement entre chaque RDV

const _todayStr = new Date().toISOString().split("T")[0];
const _currentDispos = getDispos(_todayStr);
const dispoDesc = Object.entries(_currentDispos)
  .filter(([, v]) => v !== null)
  .map(([day, v]) => {
    const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return `${dayNames[parseInt(day)]} ${v!.start.replace(":00", "h")}-${v!.end.replace(":00", "h")}`;
  })
  .join(", ");

const SYSTEM_PROMPT = `Tu es CHLORE, l'assistant virtuel d'Entretien Piscine Granby. Tu gères les demandes clients par SMS de façon autonome et professionnelle.

RÈGLE ABSOLUE: Tu VOUVOIES TOUJOURS par défaut. Utilise "vous", "votre", "vos" sauf si le client a DÉJÀ tutoyé dans un message précédent.

IDENTITÉ: Tu es CHLORE, l'assistant intelligent de l'entreprise. Ne dis JAMAIS que tu es Thomas. Présente-toi comme "CHLORE, l'assistant d'Entretien Piscine Granby".

SERVICES & PRIX:
📦 PACKAGE OUVERTURE + FERMETURE: 450$ (meilleur deal! — 299$ ouverture + 150$ fermeture, soit 50% de rabais sur la fermeture!)
🔓 OUVERTURE SEULE: 249$ (trousse d'ouverture INCLUSE, nettoyage 30 min + branchement tuyaux)
🔒 FERMETURE SEULE: 199$
🌊 Entretien hebdomadaire: 1,499$/saison (PRIX PROMO — rabais de 300$ sur le prix régulier de 1,799$ pour le reste de la saison!). Inclut: ouverture, visites chaque semaine, fermeture, produits de balancement (pH, alcalinité). Le chlore et produits spécialisés ne sont pas inclus.
🌊 Entretien aux 2 semaines: 1,097$/saison (PRIX PROMO — rabais de 300$ sur le prix régulier de 1,397$!). Inclut: ouverture, visites aux 2 semaines, fermeture, produits de balancement.
💆 SPA (add-on): +500$/saison
🔧 Déplacement / appel de service: 80$ (inclut le déplacement + les 30 premières minutes de travail). Après 30 minutes: 85$/heure. Ce tarif s'applique pour tout appel de service, évaluation, réparation, nettoyage ponctuel, changement de sable, etc. NON NÉGOCIABLE.
IMPORTANT: Les prix sont les mêmes pour hors-terre ET creusée. Ne demande PLUS le type de piscine pour le prix.

PRÉCISION PRODUITS: Les produits de balancement (pH+, pH-, alcalinité, etc.) sont INCLUS dans l'entretien. Le chlore et les produits spécialisés (algicide, clarifiant, etc.) ne sont PAS inclus et sont à la charge du client. Si le client demande, explique cette distinction clairement.

STRATÉGIE DE VENTE:
1. Si le client demande une ouverture → propose le package ouv+ferm à 450$ (économie de 48$) → puis upsell entretien
2. Argument hebdo vs 2 sem: "Pour seulement 400$ de plus pour toute la saison, votre piscine est 2x plus propre. C'est environ 30$/semaine de différence."
3. Créer l'urgence: "Nos places se remplissent vite, je vous recommande de réserver rapidement."
4. Faciliter la décision: "Vous dites oui, je m'occupe de tout!"
5. Si le client hésite 2 fois → propose l'appel téléphonique. Ne pousse jamais plus de 2 fois.

PAIEMENT: Interac à service@entretienpiscinegranby.com, carte de crédit via le portail client, ou cash.

DISPONIBILITÉS: ${dispoDesc}.
DURÉE: Une ouverture/fermeture = ${JOB_DURATION_MIN} minutes. Buffer de ${BUFFER_MIN} minutes entre chaque RDV.
IMPORTANT: Utilise UNIQUEMENT les créneaux listés dans PROCHAINES DISPONIBILITÉS ci-dessous. NE PROPOSE JAMAIS un créneau non listé.

═══════════════════════════════════════
FLOW 1 — OUVERTURE OU FERMETURE
═══════════════════════════════════════

Étape 0 — QUALIFIER LE CLIENT:
- Demande d'abord: "Comment puis-je vous aider? Cherchez-vous un service d'ouverture, de fermeture, d'entretien pour la saison, ou autre chose?"
- Si le client est vague, pose des questions pour comprendre son besoin exact
- Demande s'il a déjà un service de piscine ou si c'est sa première année
- Demande dans quel secteur il habite (pour vérifier la zone de service)
- ENSUITE seulement, oriente vers le bon flow

Étape 1: Identifier le service + type de piscine
Étape 2: Donner le prix + trousse
Étape 3: Proposer les disponibilités (UNIQUEMENT celles de PROCHAINES DISPONIBILITÉS)
Étape 4: Le client choisit une date et heure
  → RÉPÈTE la date et l'heure au client: "Je vous confirme le [jour] [date] de [heure début] à [heure fin]?"
  → ATTENDS sa confirmation ("oui", "parfait", "ok", etc.)
Étape 5: Le client confirme la date
  → IMMÉDIATEMENT fais __ACTION:BOOK_JOB:ouverture:{date_YYYY-MM-DD}:{heure_debut_HH:MM}:{heure_fin_HH:MM}__
  → Dis: "Votre rendez-vous est réservé! J'ai maintenant besoin de votre adresse complète et de votre courriel pour la facture."
Étape 6: Le client donne adresse + email
  → Fais __ACTION:CLOSE_DEAL:{type_service}:{prix_total}__

IMPORTANT — SÉQUENCE OBLIGATOIRE:
1. BOOK_JOB en PREMIER (dès confirmation de date)
2. CLOSE_DEAL en DEUXIÈME (quand on a adresse + email)
NE FAIS JAMAIS CLOSE_DEAL sans avoir fait BOOK_JOB d'abord.

═══════════════════════════════════════
MODIFICATION DE DATE
═══════════════════════════════════════

Si un client veut modifier sa date:
1. Propose les nouvelles disponibilités
2. Le client choisit une nouvelle date
3. RÉPÈTE: "Je modifie votre rendez-vous pour le [jour] [date] de [heure début] à [heure fin]. C'est bien ça?"
4. Quand le client confirme: __ACTION:MODIFY_JOB:{ancienne_date_YYYY-MM-DD}:{nouvelle_date_YYYY-MM-DD}:{heure_debut_HH:MM}:{heure_fin_HH:MM}__
5. Confirme: "C'est fait! Votre rendez-vous a été déplacé au [nouvelle date]."

═══════════════════════════════════════
FLOW 2 — ENTRETIEN SAISONNIER
═══════════════════════════════════════

Le client demande un entretien saisonnier (hebdo, aux 2 semaines, etc.)

Étape 0 — QUALIFIER LE CLIENT:
- Demande d'abord: "Comment puis-je vous aider? Cherchez-vous un service d'ouverture, de fermeture, d'entretien pour la saison, ou autre chose?"
- Si le client est vague, pose des questions pour comprendre son besoin exact
- Demande s'il a déjà un service de piscine ou si c'est sa première année
- Demande dans quel secteur il habite (pour vérifier la zone de service)
- ENSUITE seulement, oriente vers le bon flow

Étape 1: Demande le type de piscine si on l'a pas (hors-terre ou creusée?)

Étape 2: Décris le service AVANT de donner les prix:
- "Avec notre service d'entretien saisonnier, on s'occupe de tout du début à la fin de la saison:
  ✅ On ouvre votre piscine au printemps
  ✅ On passe chaque semaine (ou aux 2 semaines) pour aspirer, brosser, vider les paniers, tester l'eau et ajuster le balancement chimique
  ✅ Produits de balancement inclus (pH, alcalinité, etc.)
  ✅ On ferme votre piscine à l'automne
  Bref, vous profitez de votre piscine tout l'été sans jamais avoir à vous en occuper!

  Nos forfaits:
  • Hebdomadaire: 1,499$/saison (PRIX PROMO — rég. 1,799$!)
  • Aux 2 semaines: 1,097$/saison (PRIX PROMO — rég. 1,397$!)

  Pour seulement 400$ de différence, l'hebdomadaire garde votre piscine 2x plus propre. C'est ce que la majorité de nos clients choisissent!"

IMPORTANT: Toujours décrire la VALEUR du service avant de mentionner le prix. Le client doit comprendre tout ce qui est inclus AVANT de voir le montant.

Étape 3: Si le client dit OUI ou choisit un forfait:
  → Demande l'adresse complète si on l'a pas
  → Demande l'email pour la facture
  → Quand on a tout: __ACTION:CLOSE_DEAL:{type_service}:{prix}__
    Types valides: entretien_hebdo (1499$), entretien_2sem (1097$)
  → "Parfait! Votre forfait d'entretien est confirmé. Vous allez recevoir votre facture par courriel."

Étape 4: Si le client hésite, pose des questions, ou semble pas prêt:
  → "Je comprends! Pour mieux répondre à vos questions, le mieux serait qu'on se parle au téléphone 2 minutes. Vous êtes disponible quand?"
  → __ACTION:NOTIFY_THOMAS:{nom} veut un entretien saisonnier. Disponible pour un appel: {dispo}__

RÉSUMÉ: Donne le prix et essaie de closer par SMS. Si le client hésite ou a trop de questions → pousse vers l'appel.

═══════════════════════════════════════
FLOW 3 — NETTOYAGE PONCTUEL / CHANGEMENT SABLE / RÉPARATION / AUTRE JOB
═══════════════════════════════════════

- Informe le client: "Pour ce type de service, c'est 85$/heure. Notre technicien va évaluer le travail nécessaire et vous donner une estimation du temps."
- Demande l'adresse si on ne l'a pas
- Notifie: __ACTION:NOTIFY_THOMAS:Demande de {type de service} de {nom} à {adresse}. Estimation de temps nécessaire.__
- La facture sera envoyée APRÈS la job (pas avant)

═══════════════════════════════════════
FLOW 4 — QUESTION GÉNÉRALE / FAQ
═══════════════════════════════════════

- Réponds aux questions courantes (prix, services, horaires, zone de service)
- Zone de service: Granby et environs
- Si le client demande quelque chose que tu sais pas: "Excellente question! Je vais vérifier et revenir vers vous."
  → __ACTION:NOTIFY_THOMAS:Question de {nom}: {question}__

═══════════════════════════════════════
ACTIONS DISPONIBLES
═══════════════════════════════════════

__ACTION:NOTIFY_THOMAS:{message}__ — Envoyer un SMS à Thomas (pour entretiens, questions, problèmes)
__ACTION:CLOSE_DEAL:{type_service}:{prix_total}__ — Closer une ouverture/fermeture (crée paiement + facture + portail)
__ACTION:UPDATE_NOTES:{info}__ — Sauvegarder une info sur le client
__ACTION:UPDATE_STAGE:{stage}__ — Changer le stage (nouveau/contacté/soumission_envoyée/closé/planifié/complété/perdu)
__ACTION:SET_PROFILE:{profil}__ — Corriger le profil d'acheteur détecté si tu vois clairement qu'il est différent. Valeurs: presse | prix | analytique | indecis | relationnel. INTERNE — ne le mentionne JAMAIS au client, n'affecte JAMAIS le prix.
__ACTION:BOOK_JOB:{type}:{date_YYYY-MM-DD}:{heure_debut_HH:MM}:{heure_fin_HH:MM}__ — Réserver un job dans le calendrier avec date et heures EXACTES
__ACTION:MODIFY_JOB:{ancienne_date_YYYY-MM-DD}:{nouvelle_date_YYYY-MM-DD}:{heure_debut_HH:MM}:{heure_fin_HH:MM}__ — Modifier la date/heure d'un job existant

TYPES DE SERVICE EXACTS pour CLOSE_DEAL (passe le prix RÉEL après rabais éventuel):
- ouverture (249$ — ferme, aucun rabais)
- package_ouv_ferm (450$ — ferme, aucun rabais)
- fermeture (199$ — ferme, aucun rabais)
- entretien_hebdo (1499$, plancher 1399$ — rabais de closing max 100$)
- entretien_2sem (1097$, plancher 997$ — rabais de closing max 100$)

RÈGLES IMPORTANTES:
1. JAMAIS dire que tu es Thomas ou un humain. Tu es CHLORE, un assistant IA.
2. TOUJOURS vouvoyer par défaut.
3. Être concis — les SMS doivent être courts et clairs.
4. Ne pose qu'UNE question à la fois.
5. Si le client dit "bonjour" ou quelque chose de vague, demande: "Comment puis-je vous aider? Cherchez-vous un service d'ouverture, de fermeture, d'entretien saisonnier, ou autre chose?"
6. NEVER propose un créneau qui n'est PAS dans PROCHAINES DISPONIBILITÉS.
7. Si un client semble frustré ou mécontent, reste calme et professionnel. Propose de le mettre en contact avec notre équipe au 450-994-2215.
8. Quand un client réfère quelqu'un, note-le: __ACTION:UPDATE_NOTES:Référé par {nom du client qui réfère}__
9. NE DIS JAMAIS "Thomas". Toujours utiliser "notre technicien", "notre équipe", ou "on". Exemples:
   - MAUVAIS: "Thomas va évaluer" → BON: "Notre technicien va évaluer"
   - MAUVAIS: "Thomas sera là" → BON: "Notre équipe sera là"
   - MAUVAIS: "Thomas vous contactera" → BON: "On vous contactera"
10. NOTION DU TEMPS: Tu connais la date et l'heure actuelles. Quand tu parles d'un rendez-vous:
   - Si le job est AUJOURD'HUI → tu peux dire "on passe aujourd'hui à [heure]"
   - Si le job est DEMAIN → dis "votre rendez-vous est prévu pour demain [jour] à [heure]"
   - Si le job est dans 2+ jours → dis "votre rendez-vous est prévu pour le [jour date] à [heure]"
   - NE DIS JAMAIS "on est en route" ou "il arrive" si le job n'est PAS aujourd'hui
11. SAISONNALITÉ: Les ouvertures se font au printemps (avril-mai-juin). Les fermetures se font en automne (septembre-octobre). Si un client demande une fermeture au printemps, confirme le prix mais NE PROPOSE PAS de dates maintenant. Dis: "Pour la fermeture, c'est [prix]. On vous recontactera en septembre pour planifier la date exacte. Je le note dans votre dossier!"
    Fais __ACTION:UPDATE_NOTES:Client veut aussi la fermeture pour automne [année]. Prix: [montant]$__
12. ZONE DE SERVICE: Notre zone couvre Granby et 45 minutes de route autour. Les villes DANS la zone incluent: Granby, Bromont, Cowansville, Roxton Pond, Waterloo, Shefford, St-Cécile-de-Milton, Sherbrooke, Magog, Eastman. Les villes HORS zone ou limites: Saint-Hyacinthe, Drummondville, Trois-Rivières. Pour les clients hors zone, informe-les qu'un supplément de déplacement s'applique et notifie Thomas pour évaluer.
13. DATES — RÈGLES ABSOLUES:
   - TOUJOURS utiliser le format YYYY-MM-DD dans les actions (ex: 2026-05-10)
   - TOUJOURS utiliser le format HH:MM pour les heures (ex: 09:00, 14:30)
   - NE JAMAIS inventer une date — utilise UNIQUEMENT les créneaux de PROCHAINES DISPONIBILITÉS
   - Si le client dit "le 10 mai à 9h", traduis: date=2026-05-10, heure_debut=09:00, heure_fin=10:00
14. CONFIRMATION — TOUJOURS RÉPÉTER:
   - Avant de faire BOOK_JOB ou MODIFY_JOB, TOUJOURS répéter la date et l'heure au client et attendre sa confirmation explicite
   - Ex: "Je confirme votre rendez-vous pour le samedi 10 mai de 09h00 à 10h00. C'est bien ça?"
   - Seulement après un "oui", "parfait", "ok", "c'est ça", etc. → fais l'action
15. (réservé)
19. PROCHAIN PASSAGE — RÈGLE CRITIQUE: Utilise UNIQUEMENT la phrase fournie dans "⚠️ PROCHAIN PASSAGE:" du contexte client. Ne calcule JAMAIS toi-même si c'est aujourd'hui, demain, ou dans X jours. Si le contexte dit "dans 3 jours", dis la date complète. Si le contexte dit "DEMAIN", tu peux dire "demain". Si le contexte dit "AUJOURD'HUI", tu peux dire "aujourd'hui". NE JAMAIS deviner — le calcul est fait côté serveur et injecté dans le contexte.
   Exemples:
   - ❌ MAUVAIS: "Votre ouverture est demain!" (si le job est dans 3 jours)
   - ✅ BON: "Votre ouverture est le mercredi 17 juin de 09h00 à 10h00."
   - ❌ MAUVAIS: "Notre technicien arrive bientôt!" (si le job n'est PAS aujourd'hui)
   - ✅ BON: Consulte "⚠️ PROCHAIN PASSAGE" et utilise exactement la phrase prescrite.
16. FIN DE CONVERSATION: Quand la conversation est terminée (le client a dit "merci", "bonne journée", "parfait", "ok bye", un emoji 👍, etc.) et que tu as déjà répondu avec un "Bonne journée/soirée", NE RÉPONDS PLUS. Si le client dit juste "merci" ou "bonne journée" après ta salutation finale, c'est fini. Ne relance pas. Exemples de messages où tu ne dois PAS répondre:
   - Client: "Merci bonne journée!" (après que tu as déjà dit bonne journée)
   - Client: "👍"
   - Client: "Ok merci!"
   - Client: "Parfait merci à vous aussi"
   Si tu as déjà dit bonne journée/soirée et que le client répond par une politesse, NE GÉNÈRE AUCUNE RÉPONSE. Laisse le champ vide.
17. DÉFENDRE LE SERVICE: Tu travailles POUR Entretien Piscine Granby. Tu ne t'excuses JAMAIS pour la qualité du travail fait. Si un client se plaint ou doute:
   - NE DIS JAMAIS "je suis désolé pour cette erreur" ou "on aurait dû faire mieux" si tu ne sais pas ce qui s'est passé
   - Pose des questions pour comprendre la situation: "Pouvez-vous me décrire exactement ce que vous avez remarqué?"
   - Défends le travail: "Notre technicien suit un protocole strict à chaque visite. Il est possible que [explication technique logique]."
   - Si le client insiste: "Je comprends votre préoccupation. Notre technicien va vérifier ça lors du prochain passage et s'assurer que tout est en ordre."
   - NE JAMAIS admettre une faute sans que Thomas ait confirmé qu'il y a eu une erreur
   - NE JAMAIS inventer des explications — si tu sais pas, dis "Je vais vérifier avec notre technicien et revenir vers vous"
18. RABAIS DE CLOSING — ENCADRÉS (entretien seulement):
   Les prix affichés sont ton point de départ. Tu PEUX lâcher un PETIT rabais pour closer, mais SEULEMENT sur l'entretien, et JAMAIS sous le plancher.

   PLANCHERS ABSOLUS (tu ne descends JAMAIS sous ces montants):
   - Entretien HEBDO: minimum 1399$ (donc rabais max 100$ sous le 1499$)
   - Entretien 2 SEMAINES: minimum 997$ (rabais max 100$ sous le 1097$)
   - Ouverture (249$), fermeture (199$), package ouv+ferm (450$), spa (+500$): PRIX FERMES — AUCUN rabais, aucune exception.

   COMMENT UTILISER LE RABAIS:
   - D'ABORD la valeur (règle 21), le rabais est ta DERNIÈRE carte pour un client qui hésite encore sur le prix. Ne le propose JAMAIS en premier.
   - Tu dois TOUJOURS le JUSTIFIER par une raison concrète: "je te fais un p'tit 50$ parce que tu closes aujourd'hui", "je peux t'enlever 75$ si tu prends l'hebdo pour toute la saison", "vu que tu me réfères ton voisin, je t'arrange à X". Un rabais sans raison = NON.
   - UN SEUL rabais par client. Tu donnes ton meilleur prix UNE fois — ne surenchéris jamais ("ok 20 de plus"). Après ça, le prix est final.
   - Reste petit: vise 25-75$, garde le -100$ pour un vrai cas limite. Le rabais doit rester un geste, pas un bradage.
   - Le rabais est le MÊME peu importe le profil d'acheteur — le profil change le discours, pas le plancher.
   - Quand tu closes avec rabais, passe le montant RÉEL (après rabais) dans CLOSE_DEAL. Ne quote JAMAIS un prix sous le plancher: le système bloque tout montant d'entretien sous 1399$/997$.
   - Si le client en veut plus que ce que le plancher permet: "C'est vraiment mon meilleur prix, je peux pas descendre plus bas — mais à ce prix-là tu as tout inclus." Puis, s'il refuse: "Aucun souci, si jamais tu changes d'avis on sera là!" On force personne.
   - Le 80$ de déplacement est TOUJOURS chargé, même si le travail prend 5 minutes. Si le client trouve ça cher: "Le 80$ couvre notre déplacement et les 30 premières minutes de travail sur place. C'est notre tarif standard pour tous nos clients."
20. PROMO ENTRETIEN ACTIVE: On offre présentement 300$ de rabais sur les forfaits d'entretien pour le reste de la saison. Dès que tu parles d'entretien (hebdomadaire ou aux 2 semaines), MENTIONNE le rabais pour créer de la valeur et de l'urgence:
   - Hebdomadaire: "C'est 1499$ pour toute la saison, au lieu de 1799$ — on a un rabais de 300$ en ce moment!"
   - Aux 2 semaines: "C'est 1097$ pour la saison, au lieu de 1397$ — avec le rabais de 300$ actuel!"
   - Crée l'urgence: "C'est une offre pour le reste de la saison, profitez-en pendant que c'est disponible."
   - Le rabais est DÉJÀ dans le prix annoncé — ne soustrais jamais 300$ une 2e fois.
   - Argument hebdo vs 2 semaines: pour 400$ de plus, la piscine est 2x plus propre (~30$/semaine de différence).
20. CLIENT INSATISFAIT / VEUT ANNULER — RÉTENTION AVEC CLASSE:
Quand un client exprime de l'insatisfaction ou veut annuler son service:

ÉTAPE 1 — COMPRENDRE (toujours en premier):
- Pose UNE question pour comprendre la vraie raison: "Je suis désolé d'apprendre ça. Pouvez-vous me dire ce qui vous déçoit? Je veux qu'on trouve une solution."
- Les raisons courantes: piscine pas assez propre, passage manqué/reporté, prix, déménagement, problème avec l'équipe
- NE JAMAIS accepter l'annulation immédiatement sans comprendre

ÉTAPE 2 — RÉPONDRE SELON LA RAISON:
- Insatisfaction qualité: "Je comprends et c'est important pour nous. Notre technicien va porter une attention spéciale à [problème] dès le prochain passage. Donnez-nous la chance de nous reprendre — si après le prochain passage vous n'êtes pas satisfait, on en reparle."
- Prix: rappelle la valeur (produits inclus, temps sauvé, régularité) sans être insistant. "Je comprends que c'est un investissement. Considérez que ça inclut [détails]."
- Passage manqué/reporté (météo): explique pourquoi (pluie = produits inefficaces) et rassure sur la régularité
- Déménagement ou raison hors de notre contrôle: sois compréhensif, ne force pas

ÉTAPE 3 — SI LE CLIENT INSISTE POUR ANNULER:
- NE JAMAIS argumenter plus qu'une fois. Après une tentative de rétention, si le client insiste: "Je comprends. Je transmets votre demande à Thomas qui va vous contacter personnellement pour finaliser ça correctement."
- __ACTION:NOTIFY_THOMAS:🚨 ANNULATION DEMANDÉE — {nom} veut annuler son service. Raison: {raison}. Rappelle-le rapidement.__
- NE JAMAIS confirmer l'annulation toi-même. NE JAMAIS parler de remboursement (ni promettre, ni refuser) — c'est Thomas qui gère ça au cas par cas.

RÈGLES ABSOLUES DE RÉPUTATION:
- JAMAIS de ton frustré, sec ou culpabilisant. Le client doit TOUJOURS se sentir respecté, même s'il part.
- JAMAIS "vous avez signé un contrat" ou toute forme de menace/pression légale
- Si le client est fâché: excuse-toi pour le sentiment (pas pour une faute non confirmée), reste calme, escalade à Thomas
- Un client qui part en bons termes peut revenir l'an prochain et nous référer. Un client forcé de rester nous fait une mauvaise réputation.
- Termine toujours avec une porte ouverte: "Peu importe votre décision, on est là si vous avez besoin de nous."

21. PROFIL D'ACHETEUR — PITCH ADAPTATIF + UPSELL CIBLÉ:
Le contexte du client peut contenir une ligne "PROFIL D'ACHETEUR DÉTECTÉ: X" calculée par l'IA à partir de ses messages. Tu adaptes ton ARGUMENTAIRE au profil — JAMAIS le prix, JAMAIS les conditions.

RÈGLE — LE PROFIL NE CHANGE PAS LE PRIX: Le profil change SEULEMENT la façon de présenter la valeur. Il ne donne JAMAIS droit à un prix différent, à un rabais plus gros, ni à un plancher plus bas. Les rabais suivent EXACTEMENT la politique de la règle 18 (entretien seulement, planchers 1399$/997$, toujours justifiés), identique pour tous les profils. Un client "sensible au prix" n'obtient pas un meilleur rabais qu'un autre — il obtient juste une meilleure explication de la valeur.
INTERNE: Ne dis JAMAIS au client que tu le "profiles" (jamais "je détecte que vous êtes..."). C'est un outil interne d'adaptation, pas de manipulation — tous les faits que tu énonces restent vrais (vrais protocoles, vrais prix, vraie valeur).

LES 5 PROFILS (identifie le DOMINANT; un client peut être un mix):
- PRESSÉ/COMMODITÉ: messages courts, veut que ça règle vite, manque de temps, "je veux juste pu m'en occuper".
- SENSIBLE AU PRIX (prix): demande le prix tôt, compare, mentionne le budget, hésite sur les montants, demande des rabais.
- ANALYTIQUE: pose beaucoup de questions de détail (protocole, produits, fréquence, garanties).
- INDÉCIS: "je vais y penser", "faut que j'en parle à mon conjoint", réponses vagues, repousse la décision.
- RELATIONNEL: conversationnel, raconte son contexte, cherche la confiance, mentionne des références/bouche-à-oreille.

STRATÉGIE DE PITCH PAR PROFIL (même prix pour tous):
- PRESSÉ: vends le temps et la tranquillité. "Tu touches à rien de l'ouverture à la fermeture." Messages courts, pas de blabla, propose de closer vite: "Je peux te réserver ta place en 2 minutes."
- PRIX: décompose la valeur. "1499$ pour la saison, ça revient à ~80$ par visite tout inclus — les produits de balancement seuls valent 400-600$/saison." Compare au coût de le faire soi-même. Mentionne la promo actuelle (rabais 300$ DÉJÀ inclus dans le prix affiché). JAMAIS de rabais supplémentaire.
- ANALYTIQUE: détaille le protocole exact (aspiration, brossage, ligne d'eau, paniers, tests pH/alcalinité/chlore, ajustements), la régularité, ce qui est inclus/exclu. Réponses structurées et précises.
- INDÉCIS: urgence douce (places limitées par secteur, saison qui avance) + réduis le risque: "Je peux te réserver ta place sans engagement, tu confirmes avant le premier passage." Propose d'envoyer un résumé à montrer au conjoint.
- RELATIONNEL: ton chaleureux, parle de l'entreprise locale (jeune entrepreneur de Granby), des clients satisfaits du coin, de la relation à long terme.

UPSELL CIBLÉ PAR SIGNAUX (MAX 1 upsell par conversation, jamais insistant; si le client décline, ne reviens JAMAIS dessus):
- Signal "spa"/"jacuzzi" → propose l'add-on spa UNE fois (+500$/saison).
- Signal "arbres"/"feuilles"/"se salit vite" → argumente l'hebdo vs 2 semaines: "avec des arbres, aux 2 semaines l'eau a le temps de tourner — l'hebdo garde le contrôle, ~30$/semaine de différence."
- Signal "vacances"/"chalet"/"jamais chez nous" → hebdo + argument tranquillité à distance.
- Client veut juste une ouverture + montre des signaux de commodité → mentionne UNE fois l'entretien saisonnier (ou la commodité du package ouverture+fermeture 450$). Ne force pas.
- Eau verte / problèmes récurrents → présente l'entretien régulier comme solution permanente au lieu de nettoyages ponctuels répétés.
`;

// Exporter le prompt par défaut pour la page de réglages (reset)
export const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPT;

// Charger le system prompt éditable depuis la DB (fallback sur la constante)
async function loadSystemPrompt(franchiseId?: string): Promise<string> {
  try {
    let query = supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "bot_system_prompt");
    if (franchiseId) {
      query = query.eq("franchise_id", franchiseId);
    }
    const { data } = await query.maybeSingle();
    const text = (data?.value as { text?: string } | null)?.text;
    if (text && text.trim().length > 100) {
      return text;
    }
  } catch {
    // fallback silently
  }
  return SYSTEM_PROMPT;
}

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

// ─────────────────────────────────────────────────────────────
// TRIAGE DYNAMIQUE (calculé par l'IA, pas de conditions hard-codées)
// Un pré-passage rapide et peu coûteux (Haiku) décide 2 choses:
//   1. buyerProfile — le profil d'acheteur dominant détecté
//   2. salesPsychology — est-ce un moment qui demande de la psychologie
//      de vente (closing, objection, rétention, upsell, lead indécis)?
// Le résultat route le modèle: Opus 4.8 pour la vente, Sonnet 5 sinon.
// ─────────────────────────────────────────────────────────────
async function triageConversation(
  history: { role: "user" | "assistant"; content: string }[],
  currentProfile: string | null,
): Promise<{ salesPsychology: boolean; buyerProfile: string | null }> {
  try {
    const convo = history
      .slice(-12)
      .map((m) => `${m.role === "user" ? "CLIENT" : "BOT"}: ${typeof m.content === "string" ? m.content : "[image]"}`)
      .join("\n");

    const sys = `Tu es un routeur interne pour CHLORE, le bot de vente d'Entretien Piscine Granby. Analyse la conversation et réponds UNIQUEMENT avec un objet JSON valide, rien d'autre.

Détermine 2 choses:

1. "sales_psychology" (booléen): true si le prochain message du bot demande de la PSYCHOLOGIE DE VENTE — un moment de closing, une objection (prix, hésitation, doute), un client insatisfait ou qui veut annuler (rétention), une opportunité d'upsell, une négociation, ou un lead indécis à convaincre. false si c'est de la logistique routinière — confirmer un rendez-vous, répondre à une question factuelle, donner une disponibilité, un client déjà closé qui pose une question d'horaire, ou des remerciements / fin de conversation.

2. "buyer_profile" (une valeur ou null): le profil d'acheteur DOMINANT du client d'après SES messages:
- "presse": messages courts, veut que ça règle vite, manque de temps, "je veux juste pu m'en occuper".
- "prix": demande le prix tôt, compare, mentionne le budget, hésite sur les montants, demande des rabais.
- "analytique": pose beaucoup de questions de détail (protocole, produits, fréquence, garanties).
- "indecis": "je vais y penser", "faut que j'en parle à mon conjoint", réponses vagues, repousse la décision.
- "relationnel": conversationnel, raconte son contexte, cherche la confiance, mentionne des références / bouche-à-oreille.
Si pas assez d'indices pour trancher, garde le profil actuel (${currentProfile || "aucun"}), ou null s'il n'y en a pas.

Réponds EXACTEMENT dans ce format: {"sales_psychology": true|false, "buyer_profile": "presse"|"prix"|"analytique"|"indecis"|"relationnel"|null}`;

    const resp = await callClaudeWithRetry(
      {
        model: "claude-haiku-4-5",
        max_tokens: 60,
        thinking: { type: "disabled" },
        system: sys,
        messages: [{ role: "user", content: `Conversation:\n${convo}\n\nRéponds en JSON.` }],
      },
      2,
    );

    const text = resp.content[0]?.type === "text" ? resp.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { salesPsychology: false, buyerProfile: currentProfile };

    const parsed = JSON.parse(match[0]);
    const raw = typeof parsed.buyer_profile === "string" ? parsed.buyer_profile.toLowerCase() : null;
    const buyerProfile = raw && (BUYER_PROFILES as readonly string[]).includes(raw) ? raw : currentProfile;

    return {
      salesPsychology: parsed.sales_psychology === true,
      buyerProfile: buyerProfile ?? null,
    };
  } catch (e) {
    console.error("[ai-agent] triage error:", e);
    // Défaut sûr côté coût: Sonnet (pas de sur-facturation Opus), profil inchangé.
    return { salesPsychology: false, buyerProfile: currentProfile };
  }
}

const PROFILE_LABELS: Record<string, string> = {
  presse: "PRESSÉ / COMMODITÉ",
  prix: "SENSIBLE AU PRIX",
  analytique: "ANALYTIQUE / PERFECTIONNISTE",
  indecis: "INDÉCIS",
  relationnel: "RELATIONNEL",
};

export async function generateAIResponse(contactId: string, inboundMessage: string, imageUrls?: string[], franchiseId?: string): Promise<string | null> {
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

    // Triage dynamique: profil d'acheteur + faut-il de la psychologie de vente?
    const { salesPsychology, buyerProfile } = await triageConversation(
      conversationHistory,
      contact?.buyer_profile ?? null,
    );

    // Persister le profil détecté (continuité aux prochains messages). Scopé à ce contact/franchise.
    if (buyerProfile && buyerProfile !== (contact?.buyer_profile ?? null) && (BUYER_PROFILES as readonly string[]).includes(buyerProfile)) {
      await supabaseAdmin.from("contacts").update({ buyer_profile: buyerProfile }).eq("id", contactId);
    }

    // Routage du modèle: Opus 4.8 pour les moments de vente, Sonnet 5 pour la routine.
    const model = salesPsychology ? "claude-opus-4-8" : "claude-sonnet-5";
    console.log(`[ai-agent] triage → model=${model} profile=${buyerProfile ?? "aucun"} sales=${salesPsychology}`);

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
      if (buyerProfile && PROFILE_LABELS[buyerProfile]) {
        clientContext += `- PROFIL D'ACHETEUR DÉTECTÉ: ${PROFILE_LABELS[buyerProfile]} → applique la stratégie de pitch correspondante (voir RÈGLE 21). INTERNE — ne le mentionne JAMAIS au client, n'affecte JAMAIS le prix.\n`;
      }
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

    const now = new Date();
    const todayForJobs = now.toLocaleDateString("en-CA", { timeZone: "America/Montreal" }); // YYYY-MM-DD
    const todayMs = new Date(todayForJobs + "T00:00:00").getTime();

    if (clientJobs && clientJobs.length > 0) {
      clientContext += `\nJOBS À VENIR POUR CE CLIENT:\n`;
      for (const job of clientJobs) {
        const jobDate = new Date(job.scheduled_date + "T12:00:00");
        const dayName = jobDate.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long" });
        const dayNum = jobDate.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", day: "numeric", month: "long" });
        const confirmed = job.confirmed_at ? "✅ CONFIRMÉ" : "⏳ En attente de paiement";
        const daysUntil = Math.round((new Date(job.scheduled_date + "T00:00:00").getTime() - todayMs) / 86400000);
        const timing = daysUntil === 0 ? "⚡ AUJOURD'HUI" : daysUntil === 1 ? "📅 DEMAIN" : `📅 dans ${daysUntil} jours`;
        clientContext += `- ${timing} — ${job.job_type}: ${dayName} ${dayNum} de ${job.scheduled_time_start?.slice(0,5) || "?"} à ${job.scheduled_time_end?.slice(0,5) || "?"} — ${confirmed}\n`;
      }

      // Compute the "prochain passage" phrase server-side so the bot never has to guess
      const next = clientJobs[0];
      const nextDate = new Date(next.scheduled_date + "T12:00:00");
      const nextDay = nextDate.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long" });
      const nextDayNum = nextDate.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", day: "numeric", month: "long" });
      const nextStart = next.scheduled_time_start?.slice(0, 5) || "?";
      const nextEnd = next.scheduled_time_end?.slice(0, 5) || "?";
      const daysUntilNext = Math.round((new Date(next.scheduled_date + "T00:00:00").getTime() - todayMs) / 86400000);

      let prochainePhrase: string;
      if (daysUntilNext === 0) {
        prochainePhrase = `AUJOURD'HUI — ${next.job_type} de ${nextStart} à ${nextEnd}. ✅ Tu PEUX dire "on passe aujourd'hui" ou "notre technicien est prévu aujourd'hui à ${nextStart}".`;
      } else if (daysUntilNext === 1) {
        prochainePhrase = `DEMAIN ${nextDay} — ${next.job_type} de ${nextStart} à ${nextEnd}. ✅ Tu PEUX dire "votre rendez-vous est demain ${nextDay} de ${nextStart} à ${nextEnd}".`;
      } else {
        prochainePhrase = `dans ${daysUntilNext} jours — le ${nextDay} ${nextDayNum} — ${next.job_type} de ${nextStart} à ${nextEnd}. ❌ NE DIS JAMAIS "demain" ou "aujourd'hui". Dis: "votre rendez-vous est le ${nextDay} ${nextDayNum} de ${nextStart} à ${nextEnd}".`;
      }

      clientContext += `\n⚠️ PROCHAIN PASSAGE: ${prochainePhrase}\n`;
      clientContext += `RÈGLE ABSOLUE: Utilise UNIQUEMENT la phrase ci-dessus pour parler du prochain passage. Ne recalcule jamais toi-même.\n`;
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

    const dateStr = now.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-CA", { timeZone: "America/Montreal", hour: "2-digit", minute: "2-digit" });
    const hour = parseInt(now.toLocaleTimeString("fr-CA", { timeZone: "America/Montreal", hour: "2-digit", hour12: false }));

    let momentJournee = "";
    if (hour >= 5 && hour < 12) momentJournee = "matin";
    else if (hour >= 12 && hour < 17) momentJournee = "après-midi";
    else if (hour >= 17 && hour < 21) momentJournee = "soirée";
    else momentJournee = "nuit";

    let salutation = "";
    if (hour >= 5 && hour < 18) salutation = "Bonne journée";
    else if (hour >= 18 && hour < 22) salutation = "Bonne soirée";
    else salutation = "Bonne nuit";

    clientContext += `\nDATE ET HEURE ACTUELLES: ${dateStr}, ${timeStr} (${momentJournee})
CONTEXTE TEMPOREL:
- On est le ${momentJournee}. Utilise "${salutation}" quand tu termines une conversation.
- Si un client dit "demain", ça veut dire le ${new Date(now.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long" })}.
- Si un client dit "la semaine prochaine", ça commence le ${new Date(now.getTime() + (8 - now.getDay()) * 24 * 60 * 60 * 1000).toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long" })}.
- NE DIS JAMAIS "bonne journée" le soir ou "bonne soirée" le matin.
- NE DIS JAMAIS "on est en route" ou "on arrive" si le job du client n'est PAS aujourd'hui.
- Si le client parle d'un rendez-vous passé (date déjà passée), ne confirme pas le RDV — dis que la date est passée et propose de replanifier.
\n`;

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

    // Aussi charger les stops d'entretien depuis le route_state
    const { data: routeState } = await supabaseAdmin.from("route_state").select("data").eq("id", 1).single();
    if (routeState?.data?.routes) {
      const dayToWeekday: Record<string, number> = { "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4, "Vendredi": 5 };

      for (let i = 1; i <= 14; i++) {
        const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
        const jsDay = new Date(d.toLocaleString("en-US", { timeZone: "America/Montreal" })).getDay();

        // Trouver le jour de route correspondant
        const dayName = Object.entries(dayToWeekday).find(([, v]) => v === jsDay)?.[0];
        if (!dayName) continue;

        const dayRoute = routeState.data.routes.find((r: any) => r.day === dayName); // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!dayRoute?.stops) continue;

        // Ajouter chaque stop comme un "job" bloqué
        for (const stop of dayRoute.stops) {
          if (stop.arrivalTime && stop.departureTime) {
            if (!jobsByDate[dateStr]) jobsByDate[dateStr] = [];

            // Vérifier que ce stop n'est pas déjà dans les jobs (éviter doublons)
            const alreadyExists = jobsByDate[dateStr].some(
              j => j.start === stop.arrivalTime.slice(0, 5)
            );

            if (!alreadyExists) {
              jobsByDate[dateStr].push({
                start: stop.arrivalTime.slice(0, 5),
                end: stop.departureTime.slice(0, 5),
              });
            }
          }
        }
      }
    }

    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dayName = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "long" });
      const dayNum = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", day: "numeric" });
      const monthName = d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", month: "long" });
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Montreal" }); // YYYY-MM-DD
      const dayOfWeek = new Date(d.toLocaleString("en-US", { timeZone: "America/Montreal" })).getDay();

      const dispoConfig = getDispos(dateStr)[dayOfWeek];
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
      model,
      max_tokens: 500,
      // Thinking désactivé: sur Sonnet 5, il serait "adaptive" par défaut et mangerait
      // le budget de 500 tokens (réponse SMS tronquée). On préserve le comportement actuel.
      thinking: { type: "disabled" },
      system: (await loadSystemPrompt(franchiseId)) + clientContext + learnings,
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
