"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteStats } from "@/lib/site-stats";

/**
 * TABLEAU DE BORD LIVE — design du prototype, VRAIES données (une stat null
 * n'affiche pas sa tuile). Compteurs animés à l'entrée dans le viewport.
 */

function Counter({ value, decimals = 0 }: { value: number; decimals?: number }) {
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
        const dur = 1200;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          setDisplay(value * (1 - Math.pow(1 - p, 3)));
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

  return <span ref={ref}>{display.toFixed(decimals)}</span>;
}

export default function LiveDashboard({ stats }: { stats: SiteStats }) {
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

  const hasTiles =
    stats.visites_saison != null || stats.rapports_photo_envoyes != null || stats.temps_reponse_moyen_s != null;
  if (!hasTiles && stats.secteurs.length === 0) return null;

  return (
    <section id="live">
      <div className="wrap rv">
        <span className="eyebrow">La business, en vitre</span>
        <h2 className="sec">Nos chiffres tournent en direct</h2>
        <p className="sec-sub">
          Rien à cacher&nbsp;: le site est branché sur nos vraies opérations. Ce que tu vois, c&apos;est ce
          qui se passe.
        </p>

        {hasTiles && (
          <div className="tiles num">
            {stats.visites_saison != null && (
              <div className="tile">
                <div className="v"><Counter value={stats.visites_saison} /></div>
                <div className="l">visites d&apos;entretien cette saison</div>
              </div>
            )}
            {stats.rapports_photo_envoyes != null && (
              <div className="tile">
                <div className="v"><Counter value={stats.rapports_photo_envoyes} /></div>
                <div className="l">rapports photo envoyés</div>
              </div>
            )}
            {stats.temps_reponse_moyen_s != null && (
              <div className="tile">
                <div className="v">
                  <span><Counter value={Math.round(stats.temps_reponse_moyen_s)} /></span> s
                </div>
                <div className="l">temps de réponse moyen aux textos</div>
              </div>
            )}
          </div>
        )}

        {stats.secteurs.length > 0 && (
          <>
            <div ref={barsRef} className="sectors num">
              {stats.secteurs.map((s) => {
                const pct = Math.round(((s.capacite - s.places_restantes) / s.capacite) * 100);
                return (
                  <div className="sector" key={s.nom}>
                    <span>{s.nom}</span>
                    <div className="bar"><i style={{ width: barsOn ? `${pct}%` : "0%" }} /></div>
                    <span className="left"><b>{s.places_restantes}</b> places 2027</span>
                  </div>
                );
              })}
            </div>
            <p className="demo-note">
              On limite le nombre de clients par secteur pour passer chaque semaine sans lâcher personne.
              Quand un secteur est plein, il est plein.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
