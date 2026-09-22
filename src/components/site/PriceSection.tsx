"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/components/site/MetaPixel";

/**
 * PRIX INSTANTANÉ — design du prototype, prix depuis pricing_config
 * (la même source que le bot SMS et /reserver). ViewContent au premier scroll.
 */

export type SitePricing = {
  promo: { active: boolean; rabais_pct: number; ends_at: string; raison: string };
  tiers: Record<string, Record<string, { full: number; price: number; deposit: number; saving: number; quarterly: number; weekly: number; monthly: number }>>;
};

export type PoolChoice = "hors-terre" | "creusée";

/** 1980 → « 1 980 » (format québécois, espace insécable) */
const fmt = (n: number) => n.toLocaleString("fr-CA").replace(/ /g, " ");

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

  return (
    <section id="prix" ref={ref}>
      <div className="wrap price-grid rv">
        <div>
          <span className="eyebrow">Prix affichés — une première au Québec</span>
          <h2 className="sec">
            Ton prix exact.
            <br />
            Pas de soumission mystère.
          </h2>
          <p className="sec-sub">
            Choisis ton type de piscine. C&apos;est tout. Le prix que tu vois, c&apos;est le prix que tu
            paies — le même pour tout le monde.
          </p>
          <div className="seg" role="group" aria-label="Type de piscine">
            <button className={pool === "hors-terre" ? "on" : ""} onClick={() => onPoolChange("hors-terre")}>
              Hors-terre
            </button>
            <button className={pool === "creusée" ? "on" : ""} onClick={() => onPoolChange("creusée")}>
              Creusée
            </button>
          </div>
        </div>

        <div className="price-card">
          <span className="eyebrow">Forfait Signature · Saison 2027</span>
          <div className="price-big num" style={{ marginTop: 14 }}>
            {fmt(p.monthly)}
            <small>&nbsp;$ /mois</small>
          </div>
          <p className="num" style={{ color: "var(--muted)", fontSize: ".95rem", margin: "6px 0 2px" }}>
            Ou {fmt(p.price)}&nbsp;$ +tx d&apos;un coup — <strong style={{ color: "var(--ink)" }}>l&apos;option économique</strong>
            {promoOn && <> (au lieu de <span className="price-old">{fmt(p.full)}&nbsp;$</span>)</>}
          </p>
          {promoOn && (
            <span className="save-tag num">
              Tu économises {fmt(p.saving)}&nbsp;$ — offre pré-saison jusqu&apos;au 1er novembre
            </span>
          )}
          <ul className="inc">
            <li>Visite complète chaque semaine, de mai à octobre</li>
            <li>Tous les produits inclus — plus rien à acheter</li>
            <li>Ouverture et fermeture comprises</li>
            <li>Rapport photo texté après chaque visite</li>
          </ul>
          <div className="split num">
            <span>12 prélèvements égaux, le 1er réserve ta place</span>
            <span>≈ <b>{fmt(p.weekly)}&nbsp;$ / semaine</b> de saison</span>
          </div>
          <div className="split num" style={{ border: "none", paddingTop: 10 }}>
            <span>Réserve avec un dépôt de <b>{fmt(p.deposit)}&nbsp;$</b></span>
            <span style={{ color: "var(--green)", fontWeight: 600 }}>déduit de ta facture</span>
          </div>
          <a
            className="btn-main"
            href="/reserver"
            style={{ width: "100%", textAlign: "center", boxSizing: "border-box", marginTop: 22 }}
          >
            Réserver ma saison 2027 →
          </a>
          {promoOn && (
            <p className="deadline">
              Le -10&nbsp;% existe parce qu&apos;on planifie nos routes 2027 maintenant. Après le{" "}
              <b>1er novembre</b>, le prix remonte au tarif régulier.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
