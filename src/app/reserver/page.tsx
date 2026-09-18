"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Waves } from "lucide-react";

/**
 * /reserver — réservation self-serve saison 2027 (page publique, mobile-first).
 * 3 étapes: piscine → forfait (Signature recommandé / Essentiel) → récap + Stripe.
 */

const TIERS = {
  signature: {
    name: "Signature",
    tagline: "Tout inclus, zéro souci",
    prices: { "hors-terre": { full: 1800, final: 1620, deposit: 180 }, "creusée": { full: 2200, final: 1980, deposit: 220 } },
    inclus: [
      "Visite chaque semaine, mai à octobre",
      "Produits de balancement inclus",
      "Ouverture au printemps incluse",
      "Fermeture à l'automne incluse",
      "Rapport photo après chaque passage",
    ],
    exclus: [] as string[],
  },
  essentiel: {
    name: "Essentiel",
    tagline: "La visite hebdo, sans les extras",
    prices: { "hors-terre": { full: 1300, final: 1170, deposit: 130 }, "creusée": { full: 1500, final: 1350, deposit: 150 } },
    inclus: ["Visite chaque semaine, mai à octobre", "Tests et balancement de l'eau", "Rapport photo après chaque passage"],
    exclus: ["Produits en sus", "Ouverture en sus (180-200$)", "Fermeture en sus (150-175$)"],
  },
} as const;

type Pool = "hors-terre" | "creusée";
type Tier = keyof typeof TIERS;

function ReserverInner() {
  const done = useSearchParams().get("done") === "1";
  const [step, setStep] = useState(1);
  const [pool, setPool] = useState<Pool | null>(null);
  const [spa, setSpa] = useState(false);
  const [tier, setTier] = useState<Tier>("signature");
  const [plan, setPlan] = useState<"comptant" | "4x">("comptant");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beforeDeadline = new Date() < new Date("2026-11-01T00:00:00-04:00");

  if (done) {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🌊</div>
          <h1 className="font-display text-2xl font-semibold text-ink mb-2">Ta saison 2027 est réservée!</h1>
          <p className="text-mut">Ta confirmation s&apos;en vient par texto. Merci de ta confiance — l&apos;équipe ALTAMAR</p>
        </div>
      </Shell>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reserver/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, phone, poolType: pool, spa, tier, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue");
      setBusy(false);
    }
  };

  const p = pool ? TIERS[tier].prices[pool] : null;

  return (
    <Shell>
      {/* Progression */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-acc-grad" : "bg-chip"}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="font-display text-xl font-semibold text-ink mb-1">Ta piscine</h2>
          <p className="text-sm text-mut mb-5">Pour te donner le bon prix, tout simplement.</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(["hors-terre", "creusée"] as Pool[]).map((t) => (
              <button
                key={t}
                onClick={() => setPool(t)}
                className={`rounded-2xl border-2 p-5 text-center transition ${pool === t ? "border-acc bg-chip" : "border-line bg-sur"}`}
              >
                <div className="text-3xl mb-2">{t === "creusée" ? "🏊" : "💧"}</div>
                <div className="font-display font-semibold text-ink capitalize">{t}</div>
              </button>
            ))}
          </div>
          <label className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition ${spa ? "border-acc bg-chip" : "border-line bg-sur"}`}>
            <input type="checkbox" checked={spa} onChange={(e) => setSpa(e.target.checked)} className="w-5 h-5 accent-[var(--le-acc)]" />
            <span className="text-sm text-ink">J&apos;ai aussi un spa <span className="text-mut">(on t&apos;en reparle à l&apos;ouverture)</span></span>
          </label>
          <button
            disabled={!pool}
            onClick={() => setStep(2)}
            className="w-full mt-6 py-4 rounded-xl btn-glow font-display font-semibold text-base disabled:opacity-40"
          >
            Continuer
          </button>
        </div>
      )}

      {step === 2 && pool && (
        <div>
          <BackBtn onClick={() => setStep(1)} />
          <h2 className="font-display text-xl font-semibold text-ink mb-1">Ton forfait</h2>
          <p className="text-sm text-mut mb-5">Saison complète, mai à octobre — piscine {pool}.</p>
          <div className="space-y-3">
            {(Object.keys(TIERS) as Tier[]).map((k) => {
              const t = TIERS[k];
              const pr = t.prices[pool];
              const selected = tier === k;
              return (
                <button
                  key={k}
                  onClick={() => setTier(k)}
                  className={`w-full text-left rounded-2xl border-2 p-5 transition relative ${selected ? "border-acc bg-chip" : "border-line bg-sur"}`}
                >
                  {k === "signature" && (
                    <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-acc-grad text-accink">
                      Recommandé
                    </span>
                  )}
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-display font-semibold text-lg text-ink">{t.name}</span>
                    <span className="text-right">
                      {beforeDeadline && <span className="text-xs text-mut line-through mr-1.5 num">{pr.full}$</span>}
                      <span className="font-display font-bold text-xl text-acc num">{beforeDeadline ? pr.final : pr.full}$</span>
                    </span>
                  </div>
                  <p className="text-xs text-mut mb-3">{t.tagline}</p>
                  <ul className="space-y-1">
                    {t.inclus.map((i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-ink">
                        <Check size={14} className="text-pos shrink-0" /> {i}
                      </li>
                    ))}
                    {t.exclus.map((i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-mut">
                        <span className="w-3.5 text-center shrink-0">·</span> {i}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          <button onClick={() => setStep(3)} className="w-full mt-6 py-4 rounded-xl btn-glow font-display font-semibold text-base">
            Continuer avec {TIERS[tier].name}
          </button>
        </div>
      )}

      {step === 3 && pool && p && (
        <div>
          <BackBtn onClick={() => setStep(2)} />
          <h2 className="font-display text-xl font-semibold text-ink mb-5">Ta réservation</h2>

          <div className="rounded-2xl border border-line bg-sur p-5 mb-4">
            <Row label={`Forfait ${TIERS[tier].name} — ${pool}${spa ? " + spa" : ""}`} value={`${p.full}$`} strike={beforeDeadline} />
            {beforeDeadline && <Row label="Rabais avant le 1er novembre (-10%)" value={`-${p.full - p.final}$`} accent />}
            <div className="border-t border-line my-3" />
            <Row label="Prix de ta saison 2027" value={`${beforeDeadline ? p.final : p.full}$`} bold />
            <Row label="Dépôt aujourd'hui (déduit de ta facture de mai)" value={`${p.deposit}$`} accent bold />
          </div>

          <p className="lbl mb-2">Le reste, comment tu préfères?</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <PlanBtn active={plan === "comptant"} onClick={() => setPlan("comptant")} title="Comptant" sub="Facturé en mai" />
            <PlanBtn active={plan === "4x"} onClick={() => setPlan("4x")} title="4 versements" sub={`${Math.round(((beforeDeadline ? p.final : p.full) - p.deposit) / 4)}$/mois, mai à août`} />
          </div>

          <div className="space-y-3 mb-5">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ton prénom"
              className="w-full rounded-xl border border-line bg-sur px-4 py-3.5 text-ink input-glow outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ton cellulaire (pour la confirmation texto)"
              type="tel"
              className="w-full rounded-xl border border-line bg-sur px-4 py-3.5 text-ink input-glow outline-none"
            />
          </div>

          {error && <p className="text-sm text-neg mb-3">{error}</p>}
          <button
            disabled={busy || !firstName.trim() || phone.replace(/\D/g, "").length < 10}
            onClick={submit}
            className="w-full py-4 rounded-xl btn-glow font-display font-semibold text-base disabled:opacity-40"
          >
            {busy ? "Un instant…" : `Payer le dépôt de ${p.deposit}$ →`}
          </button>
          <p className="text-[11px] text-mut text-center mt-3">
            Paiement sécurisé par Stripe. Ton dépôt est déduit de ta facture — il ne dort pas dans nos poches.
          </p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-md mx-auto px-5 py-8">
        <div className="flex items-center gap-2 mb-8">
          <Waves size={22} className="text-acc" />
          <span className="font-display font-semibold text-xl tracking-tight text-ink">
            ALTAMAR<span className="text-acc">.</span>
          </span>
          <span className="lbl ml-auto">Saison 2027</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm text-mut mb-4 hover:text-ink">
      <ChevronLeft size={16} /> Retour
    </button>
  );
}

function Row({ label, value, strike, accent, bold }: { label: string; value: string; strike?: boolean; accent?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className={`text-sm ${bold ? "font-semibold text-ink" : "text-mut"}`}>{label}</span>
      <span className={`num ${bold ? "font-display font-bold" : ""} ${accent ? "text-acc" : strike ? "text-mut line-through" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function PlanBtn({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition ${active ? "border-acc bg-chip" : "border-line bg-sur"}`}
    >
      <div className="font-display font-semibold text-ink">{title}</div>
      <div className="text-xs text-mut mt-0.5">{sub}</div>
    </button>
  );
}

export default function ReserverPage() {
  return (
    <Suspense fallback={null}>
      <ReserverInner />
    </Suspense>
  );
}
