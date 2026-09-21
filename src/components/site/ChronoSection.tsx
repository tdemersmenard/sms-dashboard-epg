"use client";

import { useRef, useState } from "react";
import { trackEvent, newEventId } from "@/components/site/MetaPixel";
import type { PoolChoice } from "@/components/site/PriceSection";

/**
 * CHRONO 30 SECONDES — version RÉELLE du prototype: le champ envoie ton
 * numéro au système et le vrai SMS part instantanément. Le type de piscine
 * hérite du toggle de la section prix.
 */

type Phase = "idle" | "running" | "done" | "error";

export default function ChronoSection({ pool }: { pool: PoolChoice }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(30);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const digits = phone.replace(/\D/g, "");
  const valid = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));

  const clock = (s: number) => `0:${String(Math.max(0, Math.ceil(s))).padStart(2, "0")}`;

  const launch = async () => {
    if (!valid || !consent || phase === "running") return;
    setPhase("running");
    setErrMsg(null);
    setCount(30);
    const t0 = Date.now();
    timer.current = setInterval(() => {
      setCount(Math.max(0, 30 - (Date.now() - t0) / 1000));
    }, 200);

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
    <section id="chrono">
      <div className="wrap">
        <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 34px" }}>
          <span className="eyebrow">La promesse, prouvée</span>
          <h2 className="sec">Texte-nous. Chronomètre-nous.</h2>
          <p className="sec-sub" style={{ marginInline: "auto" }}>
            Tout le monde promet de «&nbsp;répondre rapidement&nbsp;». Nous, on te laisse partir le chrono.
            Entre ton numéro&nbsp;: tu reçois ta réponse par texto avant la fin du 30 secondes.
          </p>
        </div>

        <div className="chrono-wrap">
          <div className={`chrono-num num${phase === "done" ? " ok" : ""}`} aria-live="polite">
            {phase === "done" && elapsed != null ? `${elapsed.toFixed(1)}s` : clock(count)}
          </div>

          {phase === "done" ? (
            <p className="chrono-sub chrono-ok-line">
              ✓ Réponse envoyée en {elapsed?.toFixed(1)}s — regarde ton cell. Promesse tenue.
            </p>
          ) : (
            <>
              <p className="chrono-sub">
                {phase === "running"
                  ? "Ton texto est parti. Le chrono roule…"
                  : "Entre ton cellulaire et pars le chrono — la vraie réponse, avec ton vrai prix."}
              </p>
              <div className="chrono-form">
                <input
                  className="chrono-input"
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
                <label className="consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    J&apos;accepte de recevoir un texto d&apos;ALTAMAR avec mon prix. (Tu peux répondre STOP
                    n&apos;importe quand.)
                  </span>
                </label>
                <button className="btn-main" onClick={launch} disabled={!valid || !consent || phase === "running"}>
                  {phase === "running" ? "Le texto s'en vient…" : "Lancer le chrono"}
                </button>
                {errMsg && <p className="chrono-err">{errMsg}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
