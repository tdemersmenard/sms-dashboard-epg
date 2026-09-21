"use client";

import { useRef, useState } from "react";
import { trackEvent, newEventId } from "@/components/site/MetaPixel";
import type { PoolChoice } from "@/components/site/PriceSection";

/**
 * CHRONO 30 SECONDES — la pièce maîtresse. Vrai lead, vrai SMS, vrai chrono.
 * Le type de piscine hérite du toggle de la section prix.
 */

type Phase = "idle" | "running" | "done" | "error";

export default function ChronoSection({ pool }: { pool: PoolChoice }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(30.0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const digits = phone.replace(/\D/g, "");
  const valid = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));

  const launch = async () => {
    if (!valid || !consent || phase === "running") return;
    setPhase("running");
    setErrMsg(null);
    setCount(30.0);
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const left = 30 - (Date.now() - t0) / 1000;
      setCount(Math.max(0, Math.round(left * 10) / 10));
    }, 100);

    const eventId = newEventId("lead");
    try {
      const res = await fetch("/api/site/chrono-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          poolType: pool,
          consent,
          website: honeypot.current?.value || "",
          event_id: eventId,
        }),
      });
      const data = await res.json();
      if (timer.current) clearInterval(timer.current);

      if (data.ok) {
        trackEvent("Lead", { content_name: "chrono_30s" }, eventId);
        setElapsed(data.elapsed_s);
        setPhase("done");
      } else {
        setErrMsg(data.message || "Petit pépin — réessaie ou texte-nous au 450 915-9650.");
        setPhase("error");
      }
    } catch {
      if (timer.current) clearInterval(timer.current);
      setErrMsg("Petit pépin de connexion — réessaie ou texte-nous au 450 915-9650.");
      setPhase("error");
    }
  };

  return (
    <section id="chrono" style={{ background: "var(--panel)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
      <div className="container" style={{ textAlign: "center" }}>
        <p className="alta-eyebrow">La preuve, pas la promesse</p>
        <h2 style={{ fontSize: "clamp(26px, 5vw, 40px)", marginBottom: 10 }}>
          On te répond en moins de 30 secondes.
          <br />
          Chronomètre-nous.
        </h2>
        <p style={{ color: "var(--mut)", maxWidth: 520, margin: "0 auto 30px" }}>
          Mets ton numéro, pars le chrono. Tu reçois ton prix par texto avant la fin du décompte — pas un
          courriel dans 3 jours ouvrables.
        </p>

        <div className="alta-chrono-ring" aria-live="polite">
          {phase === "done" && elapsed != null ? `${elapsed.toFixed(1)}s` : count.toFixed(1)}
        </div>

        {phase === "done" ? (
          <p className="alta-success" style={{ marginTop: 16, fontSize: 17 }}>
            ✓ Réponse envoyée en {elapsed?.toFixed(1)}s — regarde ton cell.
          </p>
        ) : (
          <div style={{ maxWidth: 420, margin: "26px auto 0", display: "grid", gap: 12, textAlign: "left" }}>
            <input
              className="alta-input"
              type="tel"
              inputMode="tel"
              placeholder="Ton cellulaire (ex: 450 123-4567)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={phase === "running"}
              aria-label="Ton numéro de cellulaire"
            />
            {/* Honeypot invisible pour les bots */}
            <input
              ref={honeypot}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }}
            />
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: "var(--mut)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 3, accentColor: "var(--cyan)", width: 16, height: 16 }}
              />
              <span>J&apos;accepte de recevoir un texto d&apos;ALTAMAR avec mon prix. (Tu peux répondre STOP n&apos;importe quand.)</span>
            </label>
            <button
              className="alta-btn alta-btn-primary"
              onClick={launch}
              disabled={!valid || !consent || phase === "running"}
              style={{ opacity: !valid || !consent ? 0.5 : 1 }}
            >
              {phase === "running" ? "Le texto s'en vient…" : "Lancer le chrono ⏱"}
            </button>
            {errMsg && <p style={{ color: "#ff8a8a", fontSize: 14 }}>{errMsg}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
