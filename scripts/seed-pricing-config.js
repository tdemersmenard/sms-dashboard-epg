// Seed settings.pricing_config + sector_capacity — source unique des prix.
// node --env-file=.env.local scripts/seed-pricing-config.js
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pricing = {
  promo: {
    rabais_pct: 10,
    ends_at: "2026-11-01",
    raison: "On planifie nos routes 2027 en novembre — réserver tôt nous aide, alors on te le rend.",
  },
  saison2027: {
    signature: {
      "hors-terre": { full: 1800, promo: 1620, deposit: 162 },
      "creusée": { full: 2200, promo: 1980, deposit: 198 },
    },
    essentiel: {
      "hors-terre": { full: 1300, promo: 1170, deposit: 117 },
      "creusée": { full: 1500, promo: 1350, deposit: 135 },
    },
  },
};

// capacite: 0 = secteur masqué sur le site tant que Thomas n'a pas mis le vrai chiffre
const sectors = [
  { nom: "Granby", capacite: 0 },
  { nom: "Bromont", capacite: 0 },
  { nom: "Waterloo", capacite: 0 },
  { nom: "Roxton", capacite: 0 },
];

(async () => {
  for (const [key, value] of [["pricing_config", pricing], ["sector_capacity", sectors]]) {
    const { error } = await s.from("settings").upsert(
      { key, value: JSON.stringify(value) },
      { onConflict: "key" },
    );
    console.log(key, error ? "❌ " + error.message : "✅");
  }
})();
