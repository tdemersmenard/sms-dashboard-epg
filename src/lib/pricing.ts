import { supabaseAdmin } from "@/lib/supabase";

/**
 * SOURCE UNIQUE DES PRIX — settings clé "pricing_config".
 * Le site public, /reserver, le checkout et les openers du bot lisent tous ici.
 * Un seul endroit à modifier pour changer les prix partout.
 *
 * (La table settings sert de pricing_config: PK = key, valeur JSON —
 * même pattern que dispos_fermetures et call_queue_*.)
 */

export interface TierPrices {
  "hors-terre": { full: number; promo: number; deposit: number };
  "creusée": { full: number; promo: number; deposit: number };
}

export interface PricingConfig {
  /** Le mensuel coûte ce montant DE PLUS que le comptant sur 12 mois —
   *  le comptant devient l'option économique. */
  mensuel_premium?: number;
  promo: {
    /** Pourcentage de rabais avant la deadline */
    rabais_pct: number;
    /** Après cette date (YYYY-MM-DD, minuit Mtl), tout bascule au tarif régulier */
    ends_at: string;
    /** La raison du rabais, affichée publiquement */
    raison: string;
  };
  saison2027: {
    signature: TierPrices;
    essentiel: TierPrices;
  };
}

export const DEFAULT_PRICING: PricingConfig = {
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

export async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "pricing_config")
      .maybeSingle();
    if (data?.value) {
      const parsed = JSON.parse(data.value) as PricingConfig;
      if (parsed?.saison2027?.signature) return parsed;
    }
  } catch {
    // fallback silencieux sur les défauts
  }
  return DEFAULT_PRICING;
}

export function isPromoActive(cfg: PricingConfig, now = new Date()): boolean {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
  return today < cfg.promo.ends_at;
}

export interface EffectivePricing {
  full: number;
  /** Prix effectif aujourd'hui (promo si active, sinon régulier) */
  price: number;
  deposit: number;
  saving: number;
  promoActive: boolean;
  /** 4 versements du solde après dépôt */
  quarterly: number;
  /** Équivalent par semaine de saison (~19 semaines mai-oct) */
  weekly: number;
  /** Paiement mensuel 12 mois: (prix effectif + mensuel_premium) / 12.
   *  Le comptant économise mensuel_premium (~120$). Le prélèvement 1
   *  fait office de dépôt. */
  monthly: number;
  /** Total du plan mensuel (monthly × 12) */
  monthlyTotal: number;
  /** Économie du comptant vs le mensuel */
  cashSaving: number;
}

export function effectivePricing(
  cfg: PricingConfig,
  tier: "signature" | "essentiel",
  pool: "hors-terre" | "creusée",
  now = new Date(),
  forcePromo = false,
): EffectivePricing {
  const p = cfg.saison2027[tier][pool];
  const premium = cfg.mensuel_premium ?? 120;
  // forcePromo: programme voisin → le référé garde le -10% même après la deadline
  const promoActive = forcePromo || isPromoActive(cfg, now);
  const price = promoActive ? p.promo : p.full;
  // Dépôt = 10% du prix effectif (162$/198$ en promo, 180$/220$ au régulier)
  const deposit = promoActive ? p.deposit : Math.round(p.full * 0.10);
  return {
    full: p.full,
    price,
    deposit,
    saving: p.full - price,
    promoActive,
    quarterly: Math.round((price - deposit) / 4),
    weekly: Math.round(price / 19),
    monthly: Math.round(((price + premium) / 12) * 100) / 100,
    monthlyTotal: Math.round((Math.round(((price + premium) / 12) * 100) / 100) * 12 * 100) / 100,
    cashSaving: premium,
  };
}
