#!/usr/bin/env node
/** Templates SMS DB → ton ALTAMAR (tutoiement, équipe). À exécuter AU DÉPLOIEMENT de smooth-chlore.
 *  node --env-file=.env.local scripts/smooth-templates-db.js [--apply] */
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const NEW = {
  "Premier contact": "Salut {{prénom}}! C'est l'équipe ALTAMAR 🌊 On a bien reçu ta demande. Tu cherches une ouverture, de l'entretien pour la saison, ou autre chose?",
  "Relance nouveau lead": "Salut {{prénom}}! C'est l'équipe ALTAMAR 🌊 Petit suivi — as-tu encore besoin de nous pour ta piscine?",
  "Relance soumission": "Salut {{prénom}}! As-tu eu le temps de regarder la soumission? Une question, peut-être? 🌊",
  "Confirmation RDV": "Salut {{prénom}}! Je te confirme notre rendez-vous du {{date}}. À bientôt! 🌊",
  "Rappel paiement": "Salut {{prénom}}! Petit rappel: ton paiement de {{montant}}$ est dû. Merci! 🌊",
};
(async () => {
  console.log(APPLY ? "═══ APPLICATION ═══" : "═══ DRY-RUN (--apply pour exécuter) ═══");
  for (const [name, body] of Object.entries(NEW)) {
    const { data } = await s.from("message_templates").select("id, body").eq("name", name).maybeSingle();
    if (!data) { console.log(`"${name}": absent, skip`); continue; }
    console.log(`"${name}": sera remplacé`);
    if (APPLY) await s.from("message_templates").update({ body }).eq("id", data.id);
  }
  console.log(APPLY ? "✅ Fait." : "Aperçu terminé.");
})();
