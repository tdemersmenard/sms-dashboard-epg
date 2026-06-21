"use client";

import { useState, useEffect } from "react";
import { useFranchise } from "@/components/FranchiseProvider";
import { Settings, Phone, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ReglagesPage() {
  const { franchiseName } = useFranchise();

  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/franchises/twilio");
        if (!res.ok) throw new Error("Erreur de chargement");
        const data = await res.json();
        setAccountSid(data.accountSid || "");
        setPhoneNumber(data.phoneNumber || "");
        setHasExistingToken(data.hasToken || false);
      } catch {
        setFeedback({ type: "error", message: "Impossible de charger la configuration Twilio" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, string> = { accountSid, phoneNumber };
      if (authToken) body.authToken = authToken;

      const res = await fetch("/api/franchises/twilio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur lors de la sauvegarde");
      }

      setFeedback({ type: "success", message: "Configuration Twilio sauvegardée avec succès" });
      setHasExistingToken(true);
      setAuthToken("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="text-gray-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
          <p className="text-sm text-gray-500">{franchiseName || "Franchise"}</p>
        </div>
      </div>

      {/* Twilio Config Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <Phone size={20} className="text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Configuration Twilio</h2>
            <p className="text-sm text-gray-500">
              Connectez votre compte Twilio pour envoyer et recevoir des SMS
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <>
              {/* Account SID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account SID
                </label>
                <input
                  type="text"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Auth Token */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auth Token
                  {hasExistingToken && (
                    <span className="ml-2 text-xs text-green-600 font-normal">
                      (token enregistré — laissez vide pour conserver l&apos;existant)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder={hasExistingToken ? "••••••••••••••••" : "Votre Auth Token Twilio"}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Chiffré avec AES-256-GCM avant le stockage en base de données
                </p>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de téléphone Twilio
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+15551234567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Format E.164 (ex: +15551234567)
                </p>
              </div>

              {/* Feedback */}
              {feedback && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    feedback.type === "success"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {feedback.type === "success" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {feedback.message}
                </div>
              )}

              {/* Save Button */}
              <div className="pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !accountSid || !phoneNumber}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving && <Loader2 className="animate-spin" size={16} />}
                  {saving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
