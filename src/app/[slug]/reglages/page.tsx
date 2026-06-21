"use client";

import { useState, useEffect } from "react";
import { useFranchise } from "@/components/FranchiseProvider";
import {
  Settings, Phone, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle,
  Bell, DollarSign, Receipt,
} from "lucide-react";

interface BillingData {
  royaltyPercent: number;
  monthlyFee: number;
  franchiseFeePaid: boolean;
  franchiseFee: number;
  seasonRevenue: number;
  seasonRoyalties: number;
  seasonMonthlyFees: number;
  seasonTotal: number;
  monthRevenue: number;
  totalRevenue: number;
  monthlyBreakdown: Array<{
    month: string;
    revenue: number;
    royalty: number;
    monthlyFee: number;
    total: number;
  }>;
}

export default function ReglagesPage() {
  const { franchiseName } = useFranchise();

  // Twilio state
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [twilioLoading, setTwilioLoading] = useState(true);
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioFeedback, setTwilioFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Notification state
  const [notifPhone, setNotifPhone] = useState("");
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Billing state
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  // Load all data
  useEffect(() => {
    const loadTwilio = async () => {
      try {
        const res = await fetch("/api/franchises/twilio");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAccountSid(data.accountSid || "");
        setPhoneNumber(data.phoneNumber || "");
        setHasExistingToken(data.hasToken || false);
      } catch {
        setTwilioFeedback({ type: "error", message: "Impossible de charger la configuration Twilio" });
      } finally {
        setTwilioLoading(false);
      }
    };

    const loadNotif = async () => {
      try {
        const res = await fetch("/api/franchises/notification");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setNotifPhone(data.notificationPhone || "");
      } catch {
        // Silently fail — API might not exist yet
      } finally {
        setNotifLoading(false);
      }
    };

    const loadBilling = async () => {
      try {
        const res = await fetch("/api/franchises/billing");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setBilling(data);
      } catch {
        // Silently fail
      } finally {
        setBillingLoading(false);
      }
    };

    loadTwilio();
    loadNotif();
    loadBilling();
  }, []);

  const handleSaveTwilio = async () => {
    setTwilioSaving(true);
    setTwilioFeedback(null);
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
        throw new Error(err.error || "Erreur");
      }
      setTwilioFeedback({ type: "success", message: "Configuration Twilio sauvegardée" });
      setHasExistingToken(true);
      setAuthToken("");
    } catch (err: unknown) {
      setTwilioFeedback({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTwilioSaving(false);
    }
  };

  const handleSaveNotif = async () => {
    setNotifSaving(true);
    setNotifFeedback(null);
    try {
      const res = await fetch("/api/franchises/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPhone: notifPhone }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }
      setNotifFeedback({ type: "success", message: "Numéro de notification sauvegardé" });
    } catch (err: unknown) {
      setNotifFeedback({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setNotifSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Settings className="text-gray-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Réglages</h1>
          <p className="text-sm text-gray-500">{franchiseName || "Franchise"}</p>
        </div>
      </div>

      {/* ── NOTIFICATIONS ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <Bell size={20} className="text-orange-500" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500">
              Numéro où vous recevrez les rapports quotidiens et alertes
            </p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {notifLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de téléphone pour les notifications
                </label>
                <input
                  type="tel"
                  value={notifPhone}
                  onChange={(e) => setNotifPhone(e.target.value)}
                  placeholder="+15551234567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Rapport journalier, rappels de leads, alertes paiements
                </p>
              </div>

              {notifFeedback && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  notifFeedback.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {notifFeedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {notifFeedback.message}
                </div>
              )}

              <button
                onClick={handleSaveNotif}
                disabled={notifSaving || !notifPhone}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {notifSaving && <Loader2 className="animate-spin" size={16} />}
                {notifSaving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── MES PAIEMENTS (BILLING) ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <DollarSign size={20} className="text-green-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Mes paiements</h2>
            <p className="text-sm text-gray-500">
              Frais dus au franchiseur — lecture seule
            </p>
          </div>
        </div>
        <div className="p-6">
          {billingLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : billing ? (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <p className="text-xs font-medium text-blue-600 uppercase">Revenus saison</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{fmt(billing.seasonRevenue)} $</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                  <p className="text-xs font-medium text-orange-600 uppercase">Redevances ({billing.royaltyPercent}%)</p>
                  <p className="text-2xl font-bold text-orange-900 mt-1">{fmt(billing.seasonRoyalties)} $</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                  <p className="text-xs font-medium text-red-600 uppercase">Total dû (saison)</p>
                  <p className="text-2xl font-bold text-red-900 mt-1">{fmt(billing.seasonTotal)} $</p>
                </div>
              </div>

              {/* Structure */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-gray-600">
                <p className="font-semibold text-gray-800">Structure tarifaire</p>
                <p>• Redevance : <span className="font-medium">{billing.royaltyPercent}%</span> des revenus mensuels</p>
                <p>• Frais système : <span className="font-medium">{fmt(billing.monthlyFee)} $/mois</span></p>
                <div className="flex items-center gap-2">
                  <span>• Frais initial de franchise : <span className="font-medium">{fmt(billing.franchiseFee)} $</span></span>
                  {billing.franchiseFeePaid ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Payé</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Non payé</span>
                  )}
                </div>
              </div>

              {/* Monthly breakdown */}
              {billing.monthlyBreakdown.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Receipt size={16} />
                    Détail mensuel (saison en cours)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="py-2 pr-4 font-medium">Mois</th>
                          <th className="py-2 pr-4 font-medium text-right">Revenus</th>
                          <th className="py-2 pr-4 font-medium text-right">Redevance</th>
                          <th className="py-2 pr-4 font-medium text-right">Frais système</th>
                          <th className="py-2 font-medium text-right">Total dû</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billing.monthlyBreakdown.map((m) => (
                          <tr key={m.month} className="border-b border-gray-100">
                            <td className="py-2.5 pr-4 capitalize">{m.month}</td>
                            <td className="py-2.5 pr-4 text-right">{fmt(m.revenue)} $</td>
                            <td className="py-2.5 pr-4 text-right">{fmt(m.royalty)} $</td>
                            <td className="py-2.5 pr-4 text-right">{fmt(m.monthlyFee)} $</td>
                            <td className="py-2.5 text-right font-medium">{fmt(m.total)} $</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 font-semibold">
                          <td className="py-2.5 pr-4">Total</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(billing.seasonRevenue)} $</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(billing.seasonRoyalties)} $</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(billing.seasonMonthlyFees)} $</td>
                          <td className="py-2.5 text-right">{fmt(billing.seasonTotal)} $</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-4">Impossible de charger les données de facturation.</p>
          )}
        </div>
      </div>

      {/* ── TWILIO CONFIG ────────────────────────────────────── */}
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
          {twilioLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account SID</label>
                <input
                  type="text"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

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
                <p className="mt-1 text-xs text-gray-400">Format E.164 (ex: +15551234567)</p>
              </div>

              {twilioFeedback && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  twilioFeedback.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {twilioFeedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {twilioFeedback.message}
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleSaveTwilio}
                  disabled={twilioSaving || !accountSid || !phoneNumber}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {twilioSaving && <Loader2 className="animate-spin" size={16} />}
                  {twilioSaving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
