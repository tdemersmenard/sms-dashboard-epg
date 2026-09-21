"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import WaterCanvas from "@/components/site/WaterCanvas";
import PriceSection, { type SitePricing, type PoolChoice } from "@/components/site/PriceSection";
import ChronoSection from "@/components/site/ChronoSection";
import LiveDashboard from "@/components/site/LiveDashboard";
import type { SiteStats } from "@/lib/site-stats";

const PHONE_DISPLAY = "450 915-9650";
const PHONE_TEL = "+14509159650";

export default function SiteClient({ pricing, stats }: { pricing: SitePricing; stats: SiteStats }) {
  const [pool, setPool] = useState<PoolChoice>("hors-terre");
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Révélation au scroll des sections
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll(".rv");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); } }),
      { threshold: 0.12 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      {/* ── NAV ── */}
      <nav className={`alta-nav${scrolled ? " scrolled" : ""}`}>
        <div className="wrap nav-in">
          <a href="#" className="logo" aria-label="ALTAMAR — accueil">
            <Image src="/brand/logo-mark-64.png" alt="" width={30} height={26} priority />
            ALTAMAR
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <a href="/portail" style={{ color: "var(--muted)", fontSize: ".85rem", fontWeight: 600, textDecoration: "none" }}>
              Mon portail
            </a>
            <a className="nav-cta" href="#prix">Voir mon prix</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="hero">
        <WaterCanvas />
        <div className="wrap hero-in">
          {stats.temps_reponse_moyen_s != null && (
            <span className="live-pill" role="status">
              <span className="dot" aria-hidden="true" />
              Temps de réponse moyen cette semaine&nbsp;: <b className="num">&nbsp;{Math.round(stats.temps_reponse_moyen_s)} secondes</b>
            </span>
          )}
          <h1>
            Ta piscine, entretenue. <em>Toi, tu te baignes.</em>
          </h1>
          <p>
            Entretien de piscines et spas à Granby et les environs. Visites chaque semaine, produits inclus,
            rapport photo après chaque passage — et ton prix affiché ici, pas caché derrière une soumission.
          </p>
          <div className="hero-ctas">
            <a className="btn-main" href="#prix">Mon prix en 10 secondes</a>
            <a className="btn-ghost" href="#chrono">Teste le 30 secondes</a>
          </div>
        </div>
      </header>

      {/* ── PRIX INSTANTANÉ ── */}
      <PriceSection pricing={pricing} pool={pool} onPoolChange={setPool} />

      {/* ── CHRONO 30 SECONDES ── */}
      <ChronoSection pool={pool} />

      {/* ── TABLEAU DE BORD LIVE ── */}
      <LiveDashboard stats={stats} />

      {/* ── RAPPORT PHOTO ── */}
      <section id="rapport">
        <div className="wrap phone-sec rv">
          <div>
            <span className="eyebrow">Après chaque visite</span>
            <h2 className="sec">Tu sais exactement ce qui a été fait. Avec photos.</h2>
            <p className="sec-sub">
              Chaque passage se termine par un rapport texté&nbsp;: photos de ton eau, paramètres de chimie,
              gestes posés. T&apos;es au chalet, au bureau, en voyage — tu sais que c&apos;est fait, et tu le vois.
            </p>
          </div>
          <div className="phone" aria-label="Exemple de rapport de visite reçu par texto">
            <div className="screen">
              <div className="rp-head">Rapport de visite — jeudi 14h12</div>
              <div className="rp-photo" />
              <div className="rp-row num"><span>pH</span><b>7,4 <span className="rp-ok">✓</span></b></div>
              <div className="rp-row num"><span>Chlore libre</span><b>2,1 ppm <span className="rp-ok">✓</span></b></div>
              <div className="rp-row num"><span>Alcalinité</span><b>96 ppm <span className="rp-ok">✓</span></b></div>
              <div className="rp-row"><span>Ligne d&apos;eau</span><b className="rp-ok">Nettoyée ✓</b></div>
              <div className="rp-row"><span>Panier &amp; filtre</span><b className="rp-ok">Vidés ✓</b></div>
              <div className="rp-row" style={{ border: "none" }}><span>Prochaine visite</span><b>jeudi prochain</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="final">
        <div className="wrap rv">
          <h2>L&apos;été prochain, la seule chose que tu touches, c&apos;est l&apos;eau.</h2>
          <p>
            Réserve ta saison 2027 avant le 1er novembre&nbsp;: -10&nbsp;%, place garantie dans ton secteur,
            dépôt déduit de ta facture.
          </p>
          <a className="btn-main" href="/reserver">Réserver ma saison 2027</a>
          <p className="demo-note" style={{ marginTop: 24 }}>
            Ou texte-nous directement&nbsp;:{" "}
            <a href={`sms:${PHONE_TEL}`} className="num" style={{ color: "var(--aqua)", fontWeight: 700, textDecoration: "none" }}>
              {PHONE_DISPLAY}
            </a>
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="wrap foot-in">
          <span>
            ALTAMAR — Entretien de piscines &amp; spas · Granby, Bromont et les environs ·{" "}
            <a href="/portail" style={{ color: "var(--aqua)", textDecoration: "none" }}>Portail client</a>
          </span>
          <a href={`tel:${PHONE_TEL}`} className="num" style={{ color: "var(--faint)", textDecoration: "none" }}>{PHONE_DISPLAY}</a>
        </div>
      </footer>
    </div>
  );
}
