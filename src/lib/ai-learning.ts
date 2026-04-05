import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Charger les leçons pour les injecter dans le prompt
export async function loadLearnings(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("ai_learnings")
    .select("category, lesson")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!data || data.length === 0) return "";

  const grouped: Record<string, string[]> = {};
  for (const l of data) {
    if (!grouped[l.category]) grouped[l.category] = [];
    grouped[l.category].push(l.lesson);
  }

  let result = "\n\nLEÇONS APPRISES (respecte ces règles, elles viennent de l'expérience):\n";
  for (const [cat, lessons] of Object.entries(grouped)) {
    result += `[${cat.toUpperCase()}]\n`;
    for (const l of lessons) {
      result += `- ${l}\n`;
    }
  }
  return result;
}

// Analyser les conversations récentes et apprendre
export async function analyzeAndLearn(): Promise<string[]> {
  const newLessons: string[] = [];

  // Chercher les conversations des dernières 24h qui ont eu des problèmes
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentContacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, phone")
    .gte("updated_at", oneDayAgo)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!recentContacts || recentContacts.length === 0) return newLessons;

  const conversationSummaries: string[] = [];

  for (const contact of recentContacts) {
    if (!contact.phone?.startsWith("+")) continue;

    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("body, direction, created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: true })
      .limit(15);

    if (!messages || messages.length < 3) continue;

    const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.phone;
    const convo = messages.map(m =>
      `${m.direction === "outbound" ? "Bot" : "Client"}: ${m.body.slice(0, 150)}`
    ).join("\n");

    conversationSummaries.push(`CLIENT: ${name}\n${convo}`);
  }

  if (conversationSummaries.length === 0) return newLessons;

  // Charger les leçons existantes pour ne pas les dupliquer
  const { data: existingLessons } = await supabaseAdmin
    .from("ai_learnings")
    .select("lesson")
    .eq("active", true);
  const existingTexts = (existingLessons || []).map(l => l.lesson.toLowerCase());

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: `Tu analyses des conversations SMS entre un bot (CHLORE) et des clients d'une entreprise d'entretien de piscines. Tu dois identifier ce que le bot peut améliorer.

Cherche:
1. Des moments où le bot a mal répondu ou a boucle
2. Des questions que le bot n'a pas su répondre
3. Des clients qui ont été frustrés ou confus
4. Des patterns qui se répètent (bons ou mauvais)
5. Des informations que le bot aurait dû retenir
6. Des moments où le bot était trop insistant ou pas assez

Retourne UNIQUEMENT du JSON:
{"lessons": [{"category": "catégorie", "lesson": "la leçon apprise en une phrase claire et actionable"}]}

Catégories possibles: politesse, prix, paiement, refus, technique, timing, ton, upsell, info_client, erreur, general

Règles:
- Maximum 5 leçons par analyse
- Chaque leçon doit être une INSTRUCTION claire que le bot peut suivre
- Pas de leçons vagues. "Être plus gentil" = mauvais. "Quand le client pose une question technique sur l'eau verte, donner un conseil concret avant de proposer un service" = bon.
- Pas de doublons avec les leçons existantes`,
      messages: [{
        role: "user",
        content: `Voici les conversations récentes. Identifie les améliorations:\n\n${conversationSummaries.join("\n\n---\n\n")}\n\nLeçons déjà connues (ne pas dupliquer):\n${existingTexts.join("\n")}`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    for (const lesson of parsed.lessons || []) {
      // Vérifier que c'est pas un doublon
      if (existingTexts.some(e => e.includes(lesson.lesson.toLowerCase().slice(0, 30)))) continue;

      await supabaseAdmin.from("ai_learnings").insert({
        category: lesson.category,
        lesson: lesson.lesson,
        source: "auto-analyse",
      });
      newLessons.push(`[${lesson.category}] ${lesson.lesson}`);
    }
  } catch (err) {
    console.error("[ai-learning] Analysis error:", err);
  }

  return newLessons;
}
