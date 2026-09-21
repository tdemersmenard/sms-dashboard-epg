import { getPricingConfig, effectivePricing } from "@/lib/pricing";
import { computeSiteStats } from "@/lib/site-stats";
import SiteClient from "@/components/site/SiteClient";
import type { SitePricing } from "@/components/site/PriceSection";

export const dynamic = "force-static";
export const revalidate = 300; // stats + prix rafraîchis aux 5 min

export default async function SitePage() {
  const [cfg, stats] = await Promise.all([getPricingConfig(), computeSiteStats()]);

  const tiers: SitePricing["tiers"] = {};
  for (const tier of ["signature", "essentiel"] as const) {
    tiers[tier] = {};
    for (const pool of ["hors-terre", "creusée"] as const) {
      const e = effectivePricing(cfg, tier, pool);
      tiers[tier][pool] = {
        full: e.full, price: e.price, deposit: e.deposit,
        saving: e.saving, quarterly: e.quarterly, weekly: e.weekly,
      };
    }
  }

  const pricing: SitePricing = {
    promo: {
      active: tiers.signature["hors-terre"].price < tiers.signature["hors-terre"].full,
      rabais_pct: cfg.promo.rabais_pct,
      ends_at: cfg.promo.ends_at,
      raison: cfg.promo.raison,
    },
    tiers,
  };

  return <SiteClient pricing={pricing} stats={stats} />;
}
