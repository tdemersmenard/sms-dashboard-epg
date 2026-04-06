"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Waves } from "lucide-react";

export default function PortailLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portail/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur de connexion"); return; }
      localStorage.setItem("portal_token", data.token);
      router.push("/portail/dashboard");
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <Waves size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Entretien Piscine Granby</h1>
          <p className="text-blue-300 text-sm mt-1">Portail client</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Connexion</h2>
          <p className="text-sm text-gray-500 mb-6">Accédez à vos documents, rendez-vous et paiements</p>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4 border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Courriel</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@courriel.com"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0a1f3f] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#0d2a52] transition disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Besoin d&apos;aide? Appelez-nous au 450-994-2215
          </p>
        </div>
      </div>
    </div>
  );
}
