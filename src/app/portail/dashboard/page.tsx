"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, CalendarDays } from "lucide-react";
import { analyzeTest, scoreColor, scoreLabel, type WaterParam } from "@/lib/water-score";

/* Accueil du portail — le cadran « santé de ton eau » d'abord, puis le
   prochain passage et le dernier rapport. Aucune donnée inventée: sans
   analyse, le cadran a un état d'accueil honnête. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}` });

function fmtDate(d: string) {
  return new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-CA", {
    weekday: "long", day: "numeric", month: "long",
  });
}

export default function PortailDashboard() {
  const [client, setClient] = useState<Any>(null);
  const [test, setTest] = useState<Any>(null);
  const [testedAt, setTestedAt] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Any[]>([]);
  const [past, setPast] = useState<Any[]>([]);
  const [payments, setPayments] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);
  const [dialOn, setDialOn] = useState(false);

  useEffect(() => {
    const h = { headers: authHeaders(), cache: "no-store" as const };
    Promise.all([
      fetch("/api/portail/me", h).then((r) => r.json()),
      fetch("/api/portail/water-tests", h).then((r) => r.json()).catch(() => ({ tests: [] })),
      fetch("/api/portail/jobs", h).then((r) => r.json()).catch(() => ({ upcoming: [], past: [] })),
      fetch("/api/portail/payments", h).then((r) => r.json()).catch(() => ({ payments: [] })),
    ]).then(([me, wt, jobs, pays]) => {
      setClient(me.client || null);
      const latest = (wt.tests || [])[0] || null;
      setTest(latest);
      setTestedAt(latest?.tested_at || latest?.created_at || null);
      setUpcoming(jobs.upcoming || []);
      setPast(jobs.past || []);
      setPayments(pays.payments || []);
      setReady(true);
      setTimeout(() => setDialOn(true), 150);
    });
  }, []);

  if (!ready) return null;

  const { score, params } = analyzeTest(test);
  const filled = params.filter((p) => p.value != null);
  const nextJob = upcoming[0] || null;
  const lastJob = past[0] || null;
  const duePayment = payments.find((p) => p.status === "en_attente") || null;

  const R = 84;
  const CIRC = 2 * Math.PI * R;

  return (
    <div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 16 }}>
        Salut {client?.first_name || ""} 🌊
      </h1>

      {/* ── Cadran santé de l'eau ── */}
      <div className="ptl-card glow" style={{ textAlign: "center", padding: "24px 18px 20px" }}>
        <span className="lbl">Santé de ton eau</span>
        <div className="ptl-dial">
          <svg viewBox="0 0 200 200">
            <circle className="track" cx="100" cy="100" r={R} fill="none" strokeWidth="10" />
            {score != null && (
              <circle
                className="prog"
                cx="100" cy="100" r={R} fill="none" strokeWidth="10"
                stroke={scoreColor(score)}
                strokeDasharray={CIRC}
                strokeDashoffset={dialOn ? CIRC * (1 - score / 100) : CIRC}
                style={{ filter: `drop-shadow(0 0 7px ${scoreColor(score)})` }}
              />
            )}
          </svg>
          <div className="center">
            {score != null ? (
              <>
                <span className="score" style={{ color: scoreColor(score) }}>{score}</span>
                <span className="sur">/100</span>
              </>
            ) : (
              <span style={{ fontSize: "1.9rem" }}>💧</span>
            )}
          </div>
        </div>
        {score != null ? (
          <>
            <p style={{ fontWeight: 700, fontSize: ".95rem" }}>{scoreLabel(score)}</p>
            {testedAt && (
              <p className="ptl-note" style={{ marginTop: 4 }}>
                Analysé le {new Date(testedAt).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}
              </p>
            )}
          </>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: ".9rem", maxWidth: 300, margin: "0 auto" }}>
            Ta première analyse s&apos;en vient avec le prochain passage — ton technicien mesure tout et ça
            s&apos;affiche ici.
          </p>
        )}

        {filled.length > 0 && (
          <div style={{ textAlign: "left", marginTop: 14, borderTop: "1px solid rgba(27,58,92,.55)", paddingTop: 4 }}>
            {filled.map((p: WaterParam) => (
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
            <Link href="/portail/analyses" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--aqua)", fontSize: ".85rem", fontWeight: 700, textDecoration: "none", paddingTop: 10 }}>
              Voir l&apos;historique de ton eau <ChevronRight size={15} />
            </Link>
          </div>
        )}
      </div>

      {/* ── Paiement dû (seulement s'il y en a un) ── */}
      {duePayment && (
        <div className="ptl-card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <span className="lbl">À régler</span>
              <p style={{ fontWeight: 800, fontFamily: "var(--disp)", fontSize: "1.3rem", marginTop: 3 }}>
                {Number(duePayment.amount).toLocaleString("fr-CA")} $
              </p>
              <p className="ptl-note">{duePayment.notes || "Service de piscine"}</p>
            </div>
            <Link href="/portail/paiements" className="ptl-btn" style={{ width: "auto", padding: "12px 20px", flex: "none" }}>
              Payer
            </Link>
          </div>
        </div>
      )}

      {/* ── Prochain passage ── */}
      <div className="ptl-card" style={{ marginTop: 12 }}>
        <span className="lbl">Prochain passage</span>
        {nextJob ? (
          <div className="ptl-tl" style={{ marginTop: 12 }}>
            <div className="step">
              <div className="rail"><span className="node done" /><span className="cord done" /></div>
              <div className="txt"><b>Planifié</b>{fmtDate(nextJob.scheduled_date)}{nextJob.scheduled_time_start ? ` vers ${nextJob.scheduled_time_start.slice(0, 5)}` : ""} — {nextJob.job_type}</div>
            </div>
            <div className="step">
              <div className="rail"><span className="node now" /><span className="cord" /></div>
              <div className="txt"><b>En route</b>Tu reçois un texto quand on part vers chez toi</div>
            </div>
            <div className="step">
              <div className="rail"><span className="node" /></div>
              <div className="txt"><b>Complété</b>Rapport photo texté à la minute où on quitte ta cour</div>
            </div>
          </div>
        ) : (
          <p className="ptl-empty">
            Rien à l&apos;horaire pour l&apos;instant.{" "}
            <Link href="/portail/contact" style={{ color: "var(--aqua)" }}>Écris-nous</Link> pour planifier.
          </p>
        )}
        <Link href="/portail/rendez-vous" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--aqua)", fontSize: ".85rem", fontWeight: 700, textDecoration: "none", marginTop: 6 }}>
          <CalendarDays size={15} /> Tous tes rendez-vous <ChevronRight size={14} />
        </Link>
      </div>

      {/* ── Dernier passage ── */}
      {lastJob && (
        <div className="ptl-card" style={{ marginTop: 12 }}>
          <span className="lbl">Dernier passage</span>
          <div className="ptl-row" style={{ borderBottom: "none", paddingBottom: 4 }}>
            <span className="k">{fmtDate(lastJob.scheduled_date)}</span>
            <span className="ptl-chip ok">{lastJob.job_type} ✓</span>
          </div>
          {lastJob.notes && <p style={{ color: "var(--muted)", fontSize: ".88rem" }}>{lastJob.notes}</p>}
        </div>
      )}
    </div>
  );
}
