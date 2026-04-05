"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("portail_token") : "";
  return { Authorization: `Bearer ${token}` };
}

export default function PortailSettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portail/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors du changement de mot de passe.");
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => router.push("/portail/dashboard"), 2000);
      }
    } catch {
      setError("Erreur de connexion. Veuillez réessayer.");
    }
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <button
        onClick={() => router.back()}
        className="text-gray-400 hover:text-gray-600 text-sm mb-6 flex items-center gap-1"
      >
        ← Retour
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mon compte</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={18} className="text-[#0a1f3f]" />
          <h2 className="text-sm font-bold text-gray-800">Changer le mot de passe</h2>
        </div>

        {success ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            <p className="font-semibold">Mot de passe modifié!</p>
            <p className="text-green-700 mt-0.5">Vous allez être redirigé vers le tableau de bord.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mot de passe actuel
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                placeholder="Minimum 6 caractères"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
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
              className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#0f2855] disabled:opacity-50 transition"
            >
              {loading ? "Modification en cours..." : "Modifier le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
