// Seed settings.pricing_config + sector_capacity — source unique des prix.
// node --env-file=.env.local scripts/seed-pricing-config.js
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pricing = {
  mensuel_premium: 120,
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
  const { error } = await s.from("settings").upsert(
    { key: "pricing_config", value: JSON.stringify(pricing) },
    { onConflict: "key" },
  );
  console.log("pricing_config", error ? "❌ " + error.message : "✅");

  // sector_capacity: seed initial seulement — jamais écrasé s'il existe
  const { data: existing } = await s.from("settings").select("key").eq("key", "sector_capacity").maybeSingle();
  if (!existing) {
    await s.from("settings").insert({ key: "sector_capacity", value: JSON.stringify(sectors) });
    console.log("sector_capacity ✅ (seed initial)");
  } else {
    console.log("sector_capacity — déjà configuré, non touché");
  }
})();
