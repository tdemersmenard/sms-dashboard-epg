import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface AuditAction {
  contactId: string;
  contactName: string;
  phone: string;
  priority: "urgent" | "high" | "medium" | "low";
  action: string;
  details: string;
  category: "appeler" | "soumission" | "contrat" | "relance" | "paiement" | "rdv" | "autre";
}

export async function runAudit(): Promise<AuditAction[]> {
  // 1. Fetch all contacts with real phone numbers
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, stage, services, season_price, notes, address, pool_type")
    .order("updated_at", { ascending: false });

  if (!contacts || contacts.length === 0) return [];

  const realContacts = contacts.filter(c => c.phone && c.phone.startsWith("+"));

  // 2. Build a summary of ALL conversations in one big text
  const conversationSummaries: string[] = [];

  for (const contact of realContacts) {
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("body, direction, created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: true })
      .limit(10);

    if (!messages || messages.length === 0) continue;

    const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.phone;
    const lastMsg = messages[messages.length - 1];
    const hoursAgo = Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / 3600000);

    const convo = messages.map(m =>
      `${m.direction === "outbound" ? "Nous" : "Client"}: ${m.body.slice(0, 100)}`
    ).join("\n");

    conversationSummaries.push(
      `---\nID: ${contact.id}\nNom: ${name}\nTél: ${contact.phone}\nStage: ${contact.stage || "inconnu"}\nServices: ${JSON.stringify(contact.services) || "aucun"}\nPrix: ${contact.season_price || "non défini"}\nDernier message il y a ${hoursAgo}h (${lastMsg.direction})\n\nConversation:\n${convo}`
    );
  }

  if (conversationSummaries.length === 0) return [];

  // 3. UN SEUL appel à Claude avec toutes les conversations
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `Tu es un assistant qui analyse des conversations SMS entre une entreprise d'entretien de piscines (Entretien Piscine Granby) et ses clients. Tu dois identifier TOUTES les actions à prendre.

Réponds UNIQUEMENT en JSON valide. Format:
{"actions": [{"contactId": "uuid", "contactName": "nom", "phone": "tel", "priority": "urgent|high|medium|low", "action": "description courte", "details": "détails", "category": "appeler|soumission|contrat|relance|paiement|rdv|autre"}]}

Cherche spécifiquement:
- Client qui a demandé un rappel ou de se parler au téléphone → catégorie "appeler"
- Client qui attend une soumission ou un prix → catégorie "soumission"
- Client qui a confirmé un service mais pas de contrat envoyé → catégorie "contrat"
- Client dont le dernier message est inbound (il attend une réponse) → catégorie "relance"
- Client qui a un service confirmé mais pas payé → catégorie "paiement"
- Client qui doit avoir un RDV planifié → catégorie "rdv"

Priorités:
- urgent: attend une réponse depuis 24h+, client mécontent, rappel demandé pas fait
- high: soumission/contrat à envoyer, client intéressé chaud
- medium: relance à faire, suivi normal
- low: suivi éventuel, rien de pressant

Si une conversation ne nécessite AUCUNE action (déjà réglé, juste des tests, spam), ne l'inclus PAS.
Ne retourne PAS d'actions pour les conversations de test ou entre Thomas et lui-même.`,
      messages: [{
        role: "user",
        content: `Analyse ces ${conversationSummaries.length} conversations et identifie les actions à prendre:\n\n${conversationSummaries.join("\n\n")}`
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const actions = (parsed.actions || []) as AuditAction[];
    actions.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    return actions;
  } catch (err) {
    console.error("[ai-audit] Error:", err);
    return [];
  }
}
