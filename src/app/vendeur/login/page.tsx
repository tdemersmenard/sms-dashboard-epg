"use client";

import { useState } from "react";
import { vendeurBrowser } from "@/lib/vendeur/client";

/** Connexion closer — Supabase Auth (email + mot de passe). */
export default function VendeurLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const sb = vendeurBrowser();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) { setError("Courriel ou mot de passe incorrect."); setLoading(false); return; }
    // Vérifier que c'est bien un closer actif
    const { data: profile } = await sb.from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
    if (!profile || profile.role !== "closer" || !profile.active) {
      await sb.auth.signOut();
      setError("Ce compte n'a pas accès au portail vendeur.");
      setLoading(false);
      return;
    }
    window.location.href = "/vendeur";
  };

  return (
    <div className="vnd" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <form onSubmit={login} style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <h1 style={{ fontWeight: 900, fontSize: "1.5rem", letterSpacing: ".04em" }}>ALTAMAR</h1>
          <p className="lbl" style={{ marginTop: 6 }}>Portail vendeur</p>
        </div>
        <div className="vnd-card" style={{ display: "grid", gap: 11 }}>
          <input className="vnd-input" type="email" autoComplete="email" placeholder="Courriel" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="vnd-input" type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="vnd-err">{error}</p>}
          <button className="vnd-btn" disabled={loading || !email || !password}>{loading ? "Connexion…" : "Me connecter"}</button>
        </div>
      </form>
    </div>
  );
}
