"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* Rendez-vous — à venir puis passés, et un raccourci pour demander un
   changement (qui passe par le fil de messages de l'équipe). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

export default function PortailRendezVous() {
  const [upcoming, setUpcoming] = useState<Any[]>([]);
  const [past, setPast] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/portail/jobs", {
      headers: { Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => { setUpcoming(d.upcoming || []); setPast(d.past || []); })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 16 }}>Rendez-vous 📅</h1>

      <div className="ptl-card glow">
        <span className="lbl">À venir</span>
        {upcoming.length === 0 ? (
          <p className="ptl-empty">Rien à l&apos;horaire pour l&apos;instant.</p>
        ) : (
          <div style={{ marginTop: 4 }}>
            {upcoming.map((j) => (
              <div className="ptl-row" key={j.id}>
                <span className="k">
                  <b style={{ color: "var(--ink)", textTransform: "capitalize" }}>{j.job_type}</b>
                  <span style={{ display: "block", fontSize: ".8rem" }}>
                    {fmtDate(j.scheduled_date)}{j.scheduled_time_start ? ` · vers ${j.scheduled_time_start.slice(0, 5)}` : ""}
                  </span>
                </span>
                <span className="ptl-chip due">{j.status}</span>
              </div>
            ))}
          </div>
        )}
        <Link href="/portail/contact" className="ptl-btn-ghost" style={{ marginTop: 12 }}>
          Demander un changement
        </Link>
      </div>

      {past.length > 0 && (
        <div className="ptl-card" style={{ marginTop: 12 }}>
          <span className="lbl">Passés</span>
          <div style={{ marginTop: 4 }}>
            {past.slice(0, 15).map((j) => (
              <div className="ptl-row" key={j.id}>
                <span className="k">
                  <span style={{ textTransform: "capitalize" }}>{j.job_type}</span>
                  <span style={{ display: "block", fontSize: ".78rem", color: "var(--faint)" }}>{fmtDate(j.scheduled_date)}</span>
                </span>
                <span className="ptl-chip ok">complété ✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
