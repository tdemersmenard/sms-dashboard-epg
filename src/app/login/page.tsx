"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, Mail } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/";

  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Identifiants invalides");
        setLoading(false);
        return;
      }

      if (data.requiresTotp) {
        setTempToken(data.tempToken);
        setStep("totp");
      } else {
        window.location.href = redirect;
      }
    } catch {
      setError("Erreur de connexion");
    }
    setLoading(false);
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code: totp }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Code invalide");
        setLoading(false);
        return;
      }

      window.location.href = redirect;
    } catch {
      setError("Erreur");
    }
    setLoading(false);
  };

  return (
    <div className="bg-sur border border-line rounded-2xl p-8 w-full max-w-md">
      <div className="text-center mb-8">
        <p className="text-3xl font-bold font-display text-ink">CHLORE<span className="text-acc">.</span></p>
        <p className="text-sm text-mut mt-1">Entretien Piscine Granby</p>
      </div>

      {step === "credentials" ? (
        <form onSubmit={handleCredentials} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-ink">Email</label>
            <div className="relative mt-1">
              <Mail size={16} className="absolute left-3 top-3 text-mut" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:ring-2 focus:ring-acc focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink">Mot de passe</label>
            <div className="relative mt-1">
              <Lock size={16} className="absolute left-3 top-3 text-mut" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:ring-2 focus:ring-acc focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="text-xs text-neg text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-glow rounded-lg py-3 font-medium disabled:opacity-50 hover:opacity-90 transition"
          >
            {loading ? <Loader2 size={18} className="animate-spin inline" /> : "Se connecter"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleTotp} className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-ink font-medium">Code de vérification</p>
            <p className="text-xs text-mut mt-1">
              Entrez le code à 6 chiffres de votre app authenticator
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            required
            autoFocus
            className="w-full text-center text-2xl num tracking-widest py-3 border border-line rounded-lg focus:ring-2 focus:ring-acc focus:outline-none"
            placeholder="000000"
          />
          {error && <p className="text-xs text-neg text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || totp.length !== 6}
            className="w-full btn-glow rounded-lg py-3 font-medium disabled:opacity-50 hover:opacity-90 transition"
          >
            {loading ? <Loader2 size={18} className="animate-spin inline" /> : "Vérifier"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("credentials"); setTotp(""); setError(""); }}
            className="w-full text-sm text-mut hover:text-ink transition"
          >
            ← Retour
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="bg-sur border border-line rounded-2xl p-8 w-full max-w-md flex justify-center">
            <Loader2 size={24} className="animate-spin text-mut" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
