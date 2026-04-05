"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, User } from "lucide-react";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("portail_token") : "";
  return { Authorization: `Bearer ${token}` };
}

export default function PortailSettingsPage() {
  const router = useRouter();

  // ── Profile info state ──────────────────────────────────────
  const [infoLoading, setInfoLoading] = useState(true);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [poolType, setPoolType] = useState("");
  const [servicesList, setServicesList] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // ── Password state ──────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("portail_token");
    if (!token) { router.push("/portail"); return; }
    fetch(`/api/portail/me?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(r => r.json())
      .then(data => {
        if (data?.client) {
          const c = data.client;
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
          setDisplayName(name || "—");
          setPoolType(c.pool_type || "");
          setServicesList(c.services || []);
          setPhone(c.phone || "");
          setEmail(c.email || "");
          setAddress(c.address || "");
          setCity(c.city || "");
          setPostalCode(c.postal_code || "");
        }
        setInfoLoading(false);
      })
      .catch(() => setInfoLoading(false));
  }, [router]);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoSaving(true);
    setInfoError(null);
    try {
      const res = await fetch("/api/portail/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ phone, email, address, city, postal_code: postalCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInfoError(data.error || "Erreur lors de la sauvegarde.");
      } else {
        setInfoSuccess(true);
        setTimeout(() => setInfoSuccess(false), 3000);
      }
    } catch {
      setInfoError("Erreur de connexion. Veuillez réessayer.");
    }
    setInfoSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Les mots de passe ne correspondent pas.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/portail/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Erreur lors du changement de mot de passe.");
      } else {
        setPwSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => router.push("/portail/dashboard"), 2000);
      }
    } catch {
      setPwError("Erreur de connexion. Veuillez réessayer.");
    }
    setPwLoading(false);
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

      {/* ── Section: Mes informations ───────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <User size={18} className="text-[#0a1f3f]" />
          <h2 className="text-sm font-bold text-gray-800">Mes informations</h2>
        </div>

        {infoLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSaveInfo} className="space-y-4">
            {/* Read-only fields */}
            <div className="grid grid-cols-1 gap-3 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">Nom</p>
                <p className="text-sm text-gray-500">{displayName || "—"}</p>
              </div>
              {poolType && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-0.5">Type de piscine</p>
                  <p className="text-sm text-gray-500 capitalize">{poolType}</p>
                </div>
              )}
              {servicesList.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-0.5">Services</p>
                  <p className="text-sm text-gray-500">{servicesList.join(", ")}</p>
                </div>
              )}
            </div>

            {/* Editable fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                placeholder="450-000-0000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse courriel</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                placeholder="votre@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                placeholder="123 rue Principale"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ville</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                  placeholder="Granby"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Code postal</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] bg-gray-50"
                  placeholder="J0E 1Z0"
                />
              </div>
            </div>

            {infoError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {infoError}
              </div>
            )}
            {infoSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
                Informations mises à jour!
              </div>
            )}

            <button
              type="submit"
              disabled={infoSaving}
              className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#0f2855] disabled:opacity-50 transition"
            >
              {infoSaving ? "Sauvegarde en cours..." : "Sauvegarder"}
            </button>
          </form>
        )}
      </div>

      {/* ── Section: Changer le mot de passe ───────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={18} className="text-[#0a1f3f]" />
          <h2 className="text-sm font-bold text-gray-800">Changer le mot de passe</h2>
        </div>

        {pwSuccess ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            <p className="font-semibold">Mot de passe modifié!</p>
            <p className="text-green-700 mt-0.5">Vous allez être redirigé vers le tableau de bord.</p>
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mot de passe actuel</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nouveau mot de passe</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmer le nouveau mot de passe</label>
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

            {pwError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {pwError}
              </div>
            )}

            <button
              type="submit"
              disabled={pwLoading}
              className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#0f2855] disabled:opacity-50 transition"
            >
              {pwLoading ? "Modification en cours..." : "Modifier le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
