import { supabaseAdmin } from "@/lib/supabase";

export async function extractAndSaveContactInfo(contactId: string) {
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("body")
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(15);

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
    const emailMatch = allText.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) updates.email = emailMatch[0].toLowerCase();
  }

  // Adresse
  if (!contact.address) {
    const addrMatch = allText.match(/(\d+[\s,]+(?:rue|chemin|boul|boulevard|avenue|av\.|ch\.|rang|impasse|place|croissant|montée|côte|route)[^,\n]+)/i);
    if (addrMatch) updates.address = addrMatch[1].trim();
  }

  // Code postal
  if (!contact.postal_code) {
    const postalMatch = allText.match(/[A-Z]\d[A-Z]\s?\d[A-Z]\d/i);
    if (postalMatch) updates.postal_code = postalMatch[0].toUpperCase();
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
      const parts = nameMatch[1].trim().split(" ");
      updates.first_name = parts[0];
      if (parts[1]) updates.last_name = parts.slice(1).join(" ");
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from("contacts").update(updates).eq("id", contactId);
    console.log("[extract-info] Updated contact", contactId, "with:", Object.keys(updates));
  }
}
