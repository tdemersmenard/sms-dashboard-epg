"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteStats } from "@/lib/site-stats";

/**
 * TABLEAU DE BORD LIVE — vraies données (aucune invention: une stat null
 * n'affiche pas sa tuile). Compteurs animés à l'entrée dans le viewport.
 */

function Counter({ value, suffix = "", decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const dur = 1400;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(value * eased);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.disconnect();
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="alta-stat-num">
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default function LiveDashboard({ stats }: { stats: SiteStats }) {
  const tiles: { label: string; node: React.ReactNode }[] = [];

  if (stats.visites_saison != null) {
    tiles.push({
      label: "Visites d'entretien complétées cette saison",
      node: <Counter value={stats.visites_saison} />,
    });
  }
  if (stats.rapports_photo_envoyes != null) {
    tiles.push({
      label: "Rapports photo envoyés",
      node: <Counter value={stats.rapports_photo_envoyes} />,
    });
  }
  if (stats.temps_reponse_moyen_s != null) {
    tiles.push({
      label: "Temps de réponse moyen aux textos (7 derniers jours)",
      node: <Counter value={stats.temps_reponse_moyen_s} suffix="s" decimals={1} />,
    });
  }

  const [barsOn, setBarsOn] = useState(false);
  const barsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setBarsOn(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (tiles.length === 0 && stats.secteurs.length === 0) return null;

  return (
    <section id="live">
      <div className="container">
        <p className="alta-eyebrow">En direct de nos opérations</p>
        <h2 style={{ fontSize: "clamp(26px, 5vw, 40px)", marginBottom: 10 }}>
          Des vrais chiffres, pas du marketing.
        </h2>
        <p style={{ color: "var(--mut)", maxWidth: 560, marginBottom: 32 }}>
          Ces données viennent directement de notre système d&apos;opérations. Elles se mettent à jour toutes
          les 5 minutes.
        </p>

        <div className="grid-3">
          {tiles.map((t) => (
            <div key={t.label} className="alta-panel" style={{ textAlign: "center", padding: "34px 22px" }}>
              {t.node}
              <p style={{ color: "var(--mut)", fontSize: 14, marginTop: 12 }}>{t.label}</p>
            </div>
          ))}
        </div>

        {stats.secteurs.length > 0 && (
          <div ref={barsRef} className="alta-panel" style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 17, marginBottom: 18 }}>Places restantes pour 2027, par secteur</h3>
            <div style={{ display: "grid", gap: 16 }}>
              {stats.secteurs.map((s) => {
                const pct = Math.round(((s.capacite - s.places_restantes) / s.capacite) * 100);
                return (
                  <div key={s.nom}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{s.nom}</span>
                      <span style={{ color: s.places_restantes <= 5 ? "var(--pos)" : "var(--mut)" }}>
                        {s.places_restantes} place{s.places_restantes > 1 ? "s" : ""} restante{s.places_restantes > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="alta-bar">
                      <div style={{ width: barsOn ? `${pct}%` : "0%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
