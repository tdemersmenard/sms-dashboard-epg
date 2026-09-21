"use client";

import { useRef, useState } from "react";
import Image from "next/image";

/**
 * Connexion au portail SANS mot de passe: cellulaire → code par texto.
 * (Le lien du portail arrive aussi par SMS — le client entre juste son numéro.)
 */
export default function PortailLogin() {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portail/otp-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur — réessaie."); return; }
      setFirstName(data.firstName || null);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setError("Erreur de connexion — réessaie.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value: string) => {
    if (!/^\d{6}$/.test(value) || loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portail/otp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Mauvais code."); setCode(""); return; }
      const token = String(data.token).trim();
      document.cookie = `portal_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
      localStorage.setItem("portal_token", token);
      window.location.href = "/portail/dashboard";
    } catch {
      setError("Erreur de connexion — réessaie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ptl" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 18px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <Image src="/brand/logo-mark-192.png" alt="ALTAMAR" width={64} height={54} style={{ margin: "0 auto 14px", filter: "drop-shadow(0 0 18px rgba(25,182,217,.4))" }} />
          <h1 style={{ fontWeight: 900, fontSize: "1.5rem", letterSpacing: ".04em" }}>ALTAMAR</h1>
          <p className="lbl" style={{ marginTop: 6 }}>Portail client</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={requestCode} className="ptl-card glow" style={{ display: "grid", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800 }}>Connecte-toi avec ton cellulaire</h2>
              <p style={{ color: "var(--muted)", fontSize: ".88rem", marginTop: 6 }}>
                Le numéro où tu reçois nos textos — on t&apos;envoie un code, pas de mot de passe à retenir.
              </p>
            </div>
            <input
              className="ptl-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="450 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {error && <p className="ptl-err">{error}</p>}
            <button className="ptl-btn" disabled={!phoneValid || loading}>
              {loading ? "Envoi du code…" : "Recevoir mon code par texto"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="ptl-card glow" style={{ display: "grid", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800 }}>
                {firstName ? `Salut ${firstName}! ` : ""}Ton code s&apos;en vient 🌊
              </h2>
              <p style={{ color: "var(--muted)", fontSize: ".88rem", marginTop: 6 }}>
                Entre le code à 6 chiffres qu&apos;on vient de te texter au {phone}.
              </p>
            </div>
            <input
              ref={codeRef}
              className="ptl-input ptl-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) verify(v);
              }}
            />
            {error && <p className="ptl-err">{error}</p>}
            <button className="ptl-btn" disabled={code.length !== 6 || loading}>
              {loading ? "Vérification…" : "Me connecter"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              style={{ background: "none", border: "none", color: "var(--faint)", fontSize: ".82rem", cursor: "pointer", padding: 4 }}
            >
              Mauvais numéro? Recommencer
            </button>
          </form>
        )}

        <p className="ptl-note" style={{ textAlign: "center", marginTop: 22 }}>
          Un pépin? Texte-nous au 450 915-9650 — on répond vite, c&apos;est notre marque de commerce.
        </p>
      </div>
    </div>
  );
}
