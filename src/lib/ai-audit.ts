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
  // 1. Fetch all contacts
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone, stage, services, season_price, notes, address, pool_type")
    .order("updated_at", { ascending: false });

  if (!contacts || contacts.length === 0) return [];

  const allActions: AuditAction[] = [];

  // Keep only contacts with a real phone number
  const batch = contacts.filter((c) => c.phone && c.phone.startsWith("+")).slice(0, 50);

  for (const contact of batch) {
    // Fetch last 30 messages for this contact
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("body, direction, created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: true })
      .limit(30);

    if (!messages || messages.length === 0) continue;

    const lastMsg = messages[messages.length - 1];
    const hoursAgo = Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / 3600000);

    const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.phone;

    const convoText = messages
      .map((m) => `${m.direction === "outbound" ? "Thomas" : "Client"}: ${m.body}`)
      .join("\n");

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: `Tu es un assistant qui analyse des conversations SMS entre Thomas (propriétaire d'Entretien Piscine Granby) et ses clients. Tu dois identifier les actions à prendre.

Réponds UNIQUEMENT en JSON valide, rien d'autre. Format:
{"actions": [{"priority": "urgent|high|medium|low", "action": "description courte", "details": "détails", "category": "appeler|soumission|contrat|relance|paiement|rdv|autre"}]}

Si aucune action n'est nécessaire, retourne: {"actions": []}

IMPORTANT: Analyse chaque conversation en profondeur. Cherche spécifiquement:
- Est-ce que le client a demandé qu'on le rappelle? À quel moment?
- Est-ce que le client a demandé une soumission ou un prix?
- Est-ce que le client a posé une question qui n'a pas eu de réponse?
- Est-ce que le client a confirmé vouloir un service mais aucun contrat n'a été envoyé?
- Est-ce que le dernier message est du client (il attend une réponse)?
- Est-ce qu'un RDV a été discuté mais pas confirmé?

Si la conversation montre que le client est intéressé mais que rien n'a été conclu, c'est au minimum une action 'high' priority.
Si le client a explicitement demandé quelque chose (rappel, soumission, prix) et qu'il n'y a pas eu de suite, c'est 'urgent'.

Priorités:
- urgent: client attend une réponse depuis 24h+, urgence piscine, client mécontent
- high: soumission/contrat à envoyer, RDV à planifier, client intéressé chaud
- medium: relance à faire, suivi normal
- low: juste un suivi éventuel, rien de pressant

Catégories:
- appeler: Thomas doit appeler ce client
- soumission: une soumission doit être préparée et envoyée
- contrat: un contrat doit être préparé
- relance: un message de suivi doit être envoyé
- paiement: un paiement doit être collecté
- rdv: un rendez-vous doit être planifié ou confirmé
- autre: autre action`,
        messages: [
          {
            role: "user",
            content: `Analyse cette conversation et identifie les actions à prendre.

CLIENT: ${name}
TÉLÉPHONE: ${contact.phone}
STAGE: ${contact.stage || "inconnu"}
SERVICES: ${JSON.stringify(contact.services) || "aucun"}
PRIX SAISON: ${contact.season_price || "non défini"}
ADRESSE: ${contact.address || "inconnue"}
NOTES: ${contact.notes || "aucune"}

CONVERSATION (du plus ancien au plus récent):
${convoText}

Dernier message il y a ${hoursAgo} heures.`,
          },
        ],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      for (const action of parsed.actions || []) {
        allActions.push({
          contactId: contact.id,
          contactName: name,
          phone: contact.phone,
          priority: action.priority,
          action: action.action,
          details: action.details,
          category: action.category,
        });
      }
    } catch (parseErr) {
      console.error(`[ai-audit] Error analyzing ${name}:`, parseErr);
    }
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  allActions.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

  return allActions;
}
