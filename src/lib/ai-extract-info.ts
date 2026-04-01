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
