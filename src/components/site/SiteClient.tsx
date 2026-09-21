"use client";

import { useState } from "react";
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

  return (
    <div>
      {/* ── NAV ── */}
      <nav className="alta-nav">
        <div className="container inner">
          <a href="#" className="alta-logo" aria-label="ALTAMAR — accueil">
            <Image src="/brand/logo-mark-64.png" alt="" width={30} height={26} priority />
            ALTAMAR
          </a>
          <a href="#prix" className="alta-btn alta-btn-primary" style={{ padding: "10px 18px", fontSize: 14 }}>
            Voir mon prix
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="alta-hero">
        <WaterCanvas />
        <div className="container content">
          {stats.temps_reponse_moyen_s != null && (
            <div className="alta-pill" role="status">
              <span className="dot" aria-hidden="true" />
              Temps de réponse moyen cette semaine&nbsp;: <strong>{stats.temps_reponse_moyen_s}s</strong>
            </div>
          )}
          <h1>
            Ta piscine, entretenue.
            <br />
            <span className="aqua">Toi, tu te baignes.</span>
          </h1>
          <p className="lead">
            Entretien de piscine et spa à Granby. Les prix sont affichés, la réponse prend 30 secondes, et
            tu reçois un rapport photo après chaque passage. On ne te demande pas de nous croire — on te le
            montre.
          </p>
          <div className="ctas">
            <a href="#prix" className="alta-btn alta-btn-primary">Voir mon prix maintenant</a>
            <a href="#chrono" className="alta-btn alta-btn-ghost">Chronomètre-nous ⏱</a>
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
      <section id="rapport" style={{ background: "var(--panel)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="container">
          <div className="grid-2" style={{ alignItems: "center", gap: 40 }}>
            <div>
              <p className="alta-eyebrow">Après chaque passage</p>
              <h2 style={{ fontSize: "clamp(26px, 5vw, 40px)", marginBottom: 12 }}>
                Tu n&apos;as pas besoin d&apos;être là pour savoir que c&apos;est fait.
              </h2>
              <p style={{ color: "var(--mut)", marginBottom: 16 }}>
                À chaque visite, tu reçois un rapport par texto: photos de ta piscine, paramètres de chimie
                mesurés et ajustés, et ce qu&apos;on a fait. Pas de « faites-nous confiance » — des preuves,
                chaque semaine.
              </p>
              <ul style={{ color: "var(--mut)", display: "grid", gap: 8, fontSize: 15, listStyle: "none", padding: 0 }}>
                {["Photos avant / après", "pH, chlore, alcalinité mesurés et ajustés", "Produits utilisés notés à ta fiche", "Envoyé à la minute où on quitte ta cour"].map((t) => (
                  <li key={t} style={{ display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--pos)" }}>✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mockup téléphone — exemple de rapport */}
            <div className="alta-phone" aria-label="Exemple de rapport photo reçu par texto">
              <div className="screen">
                <div style={{ background: "var(--panel-2)", padding: "12px 16px", fontSize: 13, fontWeight: 700, borderBottom: "1px solid var(--line)" }}>
                  ALTAMAR 🌊
                </div>
                <div style={{ padding: 16, display: "grid", gap: 10 }}>
                  <div style={{ background: "var(--panel-2)", borderRadius: "14px 14px 14px 4px", padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
                    Passage complété chez toi à 10h42 ✓
                    <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
                      {[0, 1].map((i) => (
                        <div key={i} style={{ flex: 1, aspectRatio: "4/3", borderRadius: 8, background: `linear-gradient(${135 + i * 40}deg, #0e93b3, #0c2540 80%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--aqua)" }}>
                          📷 photo
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontVariantNumeric: "tabular-nums" }}>
                      {[["pH", "7,4"], ["Chlore", "2,1 ppm"], ["Alcalinité", "96 ppm"]].map(([k, v]) => (
                        <div key={k} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "var(--mut)" }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pos)" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--mut)" }}>
                      Aspirateur passé, filtre rincé, ligne d&apos;eau nettoyée. Tout est beau — bonne baignade! 🌊
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ textAlign: "center" }}>
        <div className="container">
          <h2 style={{ fontSize: "clamp(28px, 5.6vw, 44px)", marginBottom: 14 }}>
            L&apos;été 2027, tu t&apos;en occupes pas.
          </h2>
          <p style={{ color: "var(--mut)", maxWidth: 480, margin: "0 auto 28px" }}>
            Réserve ta saison en 2 minutes — ou texte-nous et chronomètre la réponse.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/reserver" className="alta-btn alta-btn-primary">Réserver ma saison 2027</a>
            <a href={`sms:${PHONE_TEL}`} className="alta-btn alta-btn-ghost">Nous texter: {PHONE_DISPLAY}</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="alta-footer">
        <div className="container" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image src="/brand/logo-mark-64.png" alt="" width={22} height={19} />
            <strong style={{ color: "var(--ink)", fontFamily: "var(--font-display-site)" }}>ALTAMAR</strong>
          </div>
          <div>Entretien de piscine et spa — Granby, Bromont, Waterloo, Roxton Pond</div>
          <div>
            Texto ou appel&nbsp;: <a href={`tel:${PHONE_TEL}`}>{PHONE_DISPLAY}</a> · 86 rue de Windsor, Granby (QC)
          </div>
          <div style={{ fontSize: 12.5, marginTop: 8 }}>
            © {new Date().getFullYear()} ALTAMAR. Réponds STOP à nos textos pour te désabonner en tout temps.
          </div>
        </div>
      </footer>
    </div>
  );
}
