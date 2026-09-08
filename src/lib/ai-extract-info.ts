import { supabaseAdmin } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Extraction LLM (Haiku) en secours des regex: les adresses données sans mot-clé
 * de rue ("780 Denison Est", "105 St Patrick") ou hors de la fenêtre récente
 * échappaient aux regex et n'étaient jamais sauvegardées.
 */
async function extractWithHaiku(
  inboundBodies: string[],
  missing: string[],
): Promise<Record<string, string>> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const convo = inboundBodies.slice(0, 50).reverse().join("\n---\n");
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      thinking: { type: "disabled" },
      system: `Tu extrais les infos d'un CLIENT depuis ses SMS à une entreprise de piscines au Québec. Réponds UNIQUEMENT un JSON avec ces clés (null si absent du texte): ${missing.map(m => `"${m}"`).join(", ")}.
- "address": adresse civique du client (numéro + rue, SANS la ville). Ex: "780 rue Denison Est", "105 St Patrick". null si jamais mentionnée.
- "city": ville. "postal_code": code postal format "J2G 8C7". "email": courriel du client.
- "pool_type": "hors-terre" ou "creusée" UNIQUEMENT si le client décrit SA piscine.
- "first_name"/"last_name": si le client se nomme.
N'INVENTE RIEN: si l'info n'est pas écrite noir sur blanc par le client, mets null.`,
      messages: [{ role: "user", content: convo || "(aucun message)" }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const out: Record<string, string> = {};
    for (const k of missing) {
      if (parsed[k] && typeof parsed[k] === "string" && parsed[k].trim()) out[k] = parsed[k].trim();
    }
    return out;
  } catch (e) {
    console.error("[extract-info] haiku extraction error:", e);
    return {};
  }
}

export async function extractAndSaveContactInfo(contactId: string) {
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("body")
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!messages || messages.length === 0) return;

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("email, address, city, postal_code, pool_type, first_name, last_name")
    .eq("id", contactId)
    .single();

  if (!contact) return;

  const allText = messages.map((m) => m.body).join("\n");
  const updates: Record<string, string> = {};

  // Email
  if (!contact.email) {
    const ignoredEmails = ["service@entretienpiscinegranby.com", "thomasdemersmenard@hotmail.com", "tdemersmenard@agencetdm.com"];
    const emailMatch = allText.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) {
      const email = emailMatch[0].toLowerCase();
      if (!ignoredEmails.includes(email) && !email.includes("entretienpiscinegranby")) {
        updates.email = email;
      }
    }
  }

  if (!contact.address) {
    for (const msg of messages) {
      const text = msg.body;
      // Match SEULEMENT: numéro + type de rue + nom de rue (max 4 mots après)
      const addrMatch = text.match(/(\d{1,5}\s+(?:rue|chemin|boul\.?|boulevard|avenue|av\.?|ch\.?|rang|impasse|place|croissant|montée|côte|route)\s+[A-Za-zÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ'-]+){0,3})/i);
      if (addrMatch) {
        let addr = addrMatch[1].trim();
        // COUPER à certains mots qui indiquent la fin de l'adresse
        addr = addr.split(/\s+(?:et|à|mon|email|courriel|pis|aussi|le|la|pour|chez|,)/i)[0].trim();
        // Enlever emails et téléphones qui se seraient glissés
        addr = addr.replace(/[\w.-]+@[\w.-]+\.\w+/g, "").replace(/\+?\d{10,}/g, "").trim();
        // Skip adresse de l'entreprise
        if (addr.toLowerCase().includes("windsor")) continue;
        if (addr.length < 8 || addr.length > 60) continue;
        updates.address = addr;
        break;
      }
    }

    // Code postal — chercher dans les messages si on a trouvé une adresse
    if (updates.address && !contact.postal_code) {
      for (const msg of messages) {
        const text = msg.body;
        const postalMatch = text.match(/[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/);
        if (postalMatch) {
          const raw = postalMatch[0].replace(/\s/g, "").toUpperCase();
          updates.postal_code = raw.slice(0, 3) + " " + raw.slice(3);
          break;
        }
      }
    }
  }

  // Code postal (si pas d'adresse trouvée, chercher quand même)
  if (!contact.postal_code && !updates.postal_code) {
    const postalMatch = allText.match(/[A-Z]\d[A-Z]\s?\d[A-Z]\d/i);
    if (postalMatch) {
      const raw = postalMatch[0].replace(/\s/g, "").toUpperCase();
      updates.postal_code = raw.slice(0, 3) + " " + raw.slice(3);
    }
  }

  // Ville
  if (!contact.city) {
    const villes = ["granby", "bromont", "waterloo", "shefford", "roxton pond", "cowansville", "saint-paul", "st-paul", "farnham", "magog"];
    const lower = allText.toLowerCase();
    for (const ville of villes) {
      if (lower.includes(ville)) {
        updates.city = ville.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        break;
      }
    }
  }

  // Type de piscine
  if (!contact.pool_type) {
    const lower = allText.toLowerCase();
    if (lower.includes("hors-terre") || lower.includes("hors terre")) {
      updates.pool_type = "hors-terre";
    } else if (lower.includes("creusée") || lower.includes("creusee") || lower.includes("inground")) {
      updates.pool_type = "creusée";
    }
  }

  // Nom
  if (!contact.first_name || contact.first_name === "Inconnu" || contact.first_name === "Lead Facebook") {
    const nameMatch = allText.match(/(?:je m'appelle|mon nom est|c'est|moi c'est)\s+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)/i);
    if (nameMatch) {
      const extractedName = nameMatch[1].trim();
      if (extractedName.length > 2 && extractedName.length < 40 && !extractedName.includes("@") && !extractedName.match(/\d{3}/)) {
        const parts = extractedName.split(" ");
        updates.first_name = parts[0];
        if (parts[1]) updates.last_name = parts.slice(1).join(" ");
      }
    }
  }

  // Fallback Haiku pour ce que les regex n'ont pas trouvé (surtout les adresses
  // sans mot-clé de rue, et les infos données plus tôt dans la conversation)
  const stillMissing: string[] = [];
  if (!contact.address && !updates.address) stillMissing.push("address");
  if (!contact.city && !updates.city) stillMissing.push("city");
  if (!contact.postal_code && !updates.postal_code) stillMissing.push("postal_code");
  if (!contact.email && !updates.email) stillMissing.push("email");
  if (!contact.pool_type && !updates.pool_type) stillMissing.push("pool_type");

  if (stillMissing.length > 0) {
    const haiku = await extractWithHaiku(messages.map((m) => m.body), stillMissing);
    // Validations spécifiques avant d'accepter
    if (haiku.address && /\d/.test(haiku.address) && haiku.address.length >= 6 && haiku.address.length <= 80 && !haiku.address.toLowerCase().includes("windsor")) {
      updates.address = haiku.address;
    }
    if (haiku.city && haiku.city.length <= 40) updates.city = haiku.city;
    if (haiku.postal_code && /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(haiku.postal_code.trim())) {
      const raw = haiku.postal_code.replace(/\s/g, "").toUpperCase();
      updates.postal_code = raw.slice(0, 3) + " " + raw.slice(3);
    }
    if (haiku.email && /^[\w.-]+@[\w.-]+\.\w{2,}$/.test(haiku.email) && !haiku.email.includes("entretienpiscinegranby")) {
      updates.email = haiku.email.toLowerCase();
    }
    if (haiku.pool_type === "hors-terre" || haiku.pool_type === "creusée") updates.pool_type = haiku.pool_type;
  }

  // Validation finale
  if (updates.address && (updates.address.match(/\+?\d{10,}/) || updates.address.includes("@"))) {
    delete updates.address;
  }
  if (updates.email && !updates.email.match(/^[\w.-]+@[\w.-]+\.\w{2,}$/)) {
    delete updates.email;
  }
  if (updates.first_name && (updates.first_name.includes("@") || updates.first_name.match(/^\d+$/))) {
    delete updates.first_name;
  }

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from("contacts").update(updates).eq("id", contactId);
    console.log("[extract-info] Updated contact", contactId, "with:", Object.keys(updates));
  }
}
