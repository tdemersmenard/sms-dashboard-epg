"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortailLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portail/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur de connexion");
      } else {
        localStorage.setItem("portail_token", data.token);
        localStorage.setItem("portail_client", JSON.stringify(data.client));
        router.push("/portail/dashboard");
      }
    } catch {
      setError("Erreur de connexion. Veuillez réessayer.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0a1f3f] flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">EPG</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0a1f3f]">Entretien Piscine Granby</h1>
          <p className="text-gray-500 mt-1 text-sm">Portail client</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Adresse courriel
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
              placeholder="votre@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#0f2855] disabled:opacity-50 transition mt-2"
          >
            {loading ? "Connexion en cours..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-gray-400">
          Mot de passe oublié?{" "}
          <span className="text-[#0a1f3f] cursor-pointer hover:underline">
            Contactez-nous au 450-994-2215
          </span>
        </p>
      </div>
    </div>
  );
}
