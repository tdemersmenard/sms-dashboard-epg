import { NextResponse } from "next/server";
import { getPricingConfig, effectivePricing } from "@/lib/pricing";

export const revalidate = 300; // cache 5 min

/**
 * Prix publics — même source que le bot SMS et le checkout (pricing_config).
 * Aucune donnée personnelle.
 */
export async function GET() {
  const cfg = await getPricingConfig();

  const tiers: Record<string, Record<string, ReturnType<typeof effectivePricing>>> = {};
  for (const tier of ["signature", "essentiel"] as const) {
    tiers[tier] = {};
    for (const pool of ["hors-terre", "creusée"] as const) {
      tiers[tier][pool] = effectivePricing(cfg, tier, pool);
    }
  }

  return NextResponse.json(
    {
      promo: {
        active: tiers.signature["hors-terre"].promoActive,
        rabais_pct: cfg.promo.rabais_pct,
        ends_at: cfg.promo.ends_at,
        raison: cfg.promo.raison,
      },
      tiers,
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
