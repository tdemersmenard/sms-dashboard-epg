"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/components/site/MetaPixel";

/**
 * PRIX INSTANTANÉ — toggle hors-terre/creusée, prix depuis pricing_config
 * (la même source que le bot SMS et /reserver). ViewContent au premier scroll.
 */

export type SitePricing = {
  promo: { active: boolean; rabais_pct: number; ends_at: string; raison: string };
  tiers: Record<string, Record<string, { full: number; price: number; deposit: number; saving: number; quarterly: number; weekly: number }>>;
};

export type PoolChoice = "hors-terre" | "creusée";

export default function PriceSection({
  pricing,
  pool,
  onPoolChange,
}: {
  pricing: SitePricing;
  pool: PoolChoice;
  onPoolChange: (p: PoolChoice) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setSeen(true);
          trackEvent("ViewContent", { content_name: "prix_instantane" });
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [seen]);

  const p = pricing.tiers.signature[pool];
  const promoOn = pricing.promo.active;
  const deadline = new Date(pricing.promo.ends_at + "T00:00:00-04:00").toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
  });

  return (
    <section id="prix" ref={ref}>
      <div className="container">
        <p className="alta-eyebrow">Prix instantané</p>
        <h2 style={{ fontSize: "clamp(26px, 5vw, 40px)", marginBottom: 10 }}>
          Pas de « demande de soumission ». Le prix est là.
        </h2>
        <p style={{ color: "var(--mut)", maxWidth: 620, marginBottom: 28 }}>
          Saison 2027 complète, forfait Signature: visite chaque semaine de mai à octobre, produits inclus,
          ouverture, fermeture, rapport photo après chaque passage.
        </p>

        <div className="alta-toggle" role="tablist" aria-label="Type de piscine">
          {(["hors-terre", "creusée"] as PoolChoice[]).map((t) => (
            <button key={t} role="tab" aria-selected={pool === t} className={pool === t ? "on" : ""} onClick={() => onPoolChange(t)}>
              {t === "hors-terre" ? "Hors-terre" : "Creusée"}
            </button>
          ))}
        </div>

        <div className="alta-panel" style={{ marginTop: 22, maxWidth: 560 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            {promoOn && <span className="alta-price-strike">{p.full}$</span>}
            <span className="alta-price-num">{p.price}$</span>
            {promoOn && <span className="alta-save-chip">Tu économises {p.saving}$</span>}
          </div>

          <div style={{ marginTop: 18, display: "grid", gap: 8, color: "var(--mut)", fontSize: 15 }}>
            <div>
              Ou <strong style={{ color: "var(--ink)" }}>4 versements de {p.quarterly}$</strong> — mai à août
            </div>
            <div>
              Ça revient à environ <strong style={{ color: "var(--ink)" }}>{p.weekly}$/semaine</strong> de saison, tout inclus
            </div>
            <div>
              Dépôt de <strong style={{ color: "var(--ink)" }}>{p.deposit}$</strong> — déduit directement de ta facture de mai.
              Il ne dort pas dans nos poches.
            </div>
          </div>

          {promoOn && (
            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid var(--line)",
                fontSize: 14,
                color: "var(--mut)",
              }}
            >
              <strong style={{ color: "var(--aqua)" }}>Pourquoi -{pricing.promo.rabais_pct}%?</strong>{" "}
              {pricing.promo.raison} L&apos;offre se termine le <strong style={{ color: "var(--ink)" }}>{deadline}</strong>.
            </div>
          )}

          <a
            href="/reserver"
            className="alta-btn alta-btn-primary"
            style={{ marginTop: 22, width: "100%" }}
          >
            Réserver ma saison 2027 →
          </a>
        </div>
      </div>
    </section>
  );
}
