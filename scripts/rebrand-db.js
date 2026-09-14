#!/usr/bin/env node
/**
 * Migration DB — rebranding ALTAMAR.
 *
 * À EXÉCUTER AU MOMENT DU DÉPLOIEMENT de la branche rebrand-altamar
 * (pas avant: la prod actuelle afficherait un mélange des deux marques).
 *
 *   node --env-file=.env.local scripts/rebrand-db.js          → aperçu (dry-run)
 *   node --env-file=.env.local scripts/rebrand-db.js --apply  → applique
 *
 * Change: franchises.name (Granby), message_templates (5), ai_learnings (marque
 * seulement — les adresses contenant "granby" sont conservées).
 * Ne touche PAS: les vieux PDF stockés, les messages historiques, les adresses.
 */
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const GRANBY_ID = "00000000-0000-0000-0000-000000000001";

const swapBrand = (t) =>
  t.replace(/Entretien Piscine Granby/g, "ALTAMAR")
   .replace(/entretien piscine granby/g, "ALTAMAR")
   .replace(/ENTRETIEN PISCINE GRANBY/g, "ALTAMAR");

(async () => {
  console.log(APPLY ? "═══ APPLICATION ═══" : "═══ DRY-RUN (ajoute --apply pour exécuter) ═══");

  // 1. Nom de la franchise Granby → ALTAMAR (slug inchangé)
  const { data: f } = await s.from("franchises").select("id, name").eq("id", GRANBY_ID).single();
  if (f && f.name !== "ALTAMAR") {
    console.log(`franchise: "${f.name}" → "ALTAMAR"`);
    if (APPLY) await s.from("franchises").update({ name: "ALTAMAR" }).eq("id", GRANBY_ID);
  }

  // 2. Templates SMS contenant l'ancienne marque
  const { data: templates } = await s.from("message_templates").select("id, name, body");
  for (const t of templates || []) {
    const next = swapBrand(t.body);
    if (next !== t.body) {
      console.log(`template "${t.name}": marque remplacée`);
      if (APPLY) await s.from("message_templates").update({ body: next }).eq("id", t.id);
    }
  }

  // 3. Learnings du bot — MARQUE seulement (les adresses "à granby" restent)
  const { data: learnings } = await s.from("ai_learnings").select("id, lesson").or(
    "lesson.ilike.%entretien piscine granby%"
  );
  for (const l of learnings || []) {
    const next = swapBrand(l.lesson);
    if (next !== l.lesson) {
      console.log(`learning [${l.id.slice(0, 8)}]: marque remplacée`);
      if (APPLY) await s.from("ai_learnings").update({ lesson: next }).eq("id", l.id);
    }
  }

  console.log(APPLY ? "✅ Migration appliquée." : "Aperçu terminé — rien modifié.");
})();
