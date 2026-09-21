"use client";

import { useEffect, useState } from "react";
import { analyzeTest, scoreColor } from "@/lib/water-score";

/* Mon eau — historique des analyses en plages colorées + tendance. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function PortailAnalyses() {
  const [tests, setTests] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/portail/water-tests", {
      headers: { Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setTests(d.tests || []))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  const scored = tests
    .map((t) => ({ t, ...analyzeTest(t) }))
    .filter((x) => x.score != null);

  // Tendance saison (du plus ancien au plus récent)
  const trend = [...scored].reverse();
  const sparkPts = trend
    .map((x, i) => `${(i / Math.max(1, trend.length - 1)) * 100},${40 - (x.score! / 100) * 36}`)
    .join(" ");

  return (
    <div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 6 }}>Mon eau 💧</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 16 }}>
        Chaque passage, ton technicien mesure et ajuste. Vert = dans la plage idéale.
      </p>

      {trend.length >= 3 && (
        <div className="ptl-card" style={{ marginBottom: 12 }}>
          <span className="lbl">Tendance de la saison</span>
          <svg className="ptl-spark" viewBox="0 0 100 40" preserveAspectRatio="none">
            <polyline points={sparkPts} fill="none" stroke="var(--aqua)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}

      {tests.length === 0 ? (
        <div className="ptl-card">
          <p className="ptl-empty">
            Pas encore d&apos;analyse à ton dossier — ta première arrive avec le prochain passage. Tu la
            verras ici avec chaque paramètre en vert, jaune ou rouge. 🌊
          </p>
        </div>
      ) : (
        tests.map((t) => {
          const { score, params } = analyzeTest(t);
          const date = t.tested_at || t.created_at;
          const filled = params.filter((p) => p.value != null);
          return (
            <div className="ptl-card" key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 800, fontFamily: "var(--disp)", fontSize: ".95rem" }}>
                  {new Date(date).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                {score != null && (
                  <span style={{ fontFamily: "var(--disp)", fontWeight: 900, color: scoreColor(score) }}>
                    {score}<span style={{ color: "var(--faint)", fontWeight: 600, fontSize: ".78rem" }}>/100</span>
                  </span>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                {filled.map((p) => (
                  <div className="ptl-param" key={p.key}>
                    <span className={`dot ptl-dot-${p.rating}`} />
                    <span>
                      <span className="name">{p.label}</span>{" "}
                      <span className="range">idéal {p.ideal}{p.unit ? ` ${p.unit}` : ""}</span>
                    </span>
                    <span />
                    <span className={`val ptl-${p.rating}`}>
                      {p.value!.toLocaleString("fr-CA")}{p.unit ? ` ${p.unit}` : ""}
                    </span>
                  </div>
                ))}
              </div>
              {t.notes && <p className="ptl-note" style={{ marginTop: 8 }}>{t.notes}</p>}
            </div>
          );
        })
      )}
    </div>
  );
}
