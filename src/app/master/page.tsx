"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Plus, Check, Clock, XCircle, DollarSign, Users, Briefcase,
  Loader2, X, LogIn, Settings, BarChart3, CreditCard, CalendarDays,
} from "lucide-react";
import Link from "next/link";

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string; icon: typeof Check }> = {
  active:    { label: "Active",    bg: "bg-chip",  text: "text-pos",  icon: Check    },
  pending:   { label: "En attente", bg: "bg-chip", text: "text-warn", icon: Clock    },
  suspended: { label: "Suspendue", bg: "bg-chip",    text: "text-neg",    icon: XCircle  },
};

interface FranchiseStat {
  id: string;
  name: string;
  slug: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  territory: string | null;
  status: string;
  franchise_fee_paid: boolean;
  twilio_phone_number: string | null;
  created_at: string;
  stats: {
    clientCount: number;
    activeJobCount: number;
    periodRevenue: number;
    royaltyDue: number;
    monthlyFee: number;
    monthlyFees: number;
    totalDue: number;
  };
}

type MasterTab = "overview" | "billing" | "settings";
type Period = "season" | "month" | "year" | "custom";

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "season", label: "Depuis le début de la saison" },
  { id: "month",  label: "Ce mois-ci" },
  { id: "year",   label: "Cette année" },
  { id: "custom", label: "Période personnalisée" },
];

const MASTER_NAV: { id: MasterTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
  { id: "billing",  label: "Facturation",    icon: CreditCard },
  { id: "settings", label: "Réglages",       icon: Settings },
];

const EMPTY_FORM = {
  name: "", owner_name: "", owner_email: "", owner_phone: "",
  territory: "", business_address: "",
  twilio_account_sid: "", twilio_auth_token: "", twilio_phone_number: "",
  email: "", payment_interac_email: "",
  owner_password: "",
};

export default function MasterPage() {
  const [franchises, setFranchises] = useState<FranchiseStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MasterTab>("overview");

  // Period selector
  const [period, setPeriod] = useState<Period>("season");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [periodLabel, setPeriodLabel] = useState("Depuis le début de la saison");
  const [monthCount, setMonthCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    let url = `/api/master/franchises?period=${period}`;
    if (period === "custom" && customStart) {
      url += `&start=${customStart}`;
      if (customEnd) url += `&end=${customEnd}`;
    }
    const res = await fetch(url);
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setFranchises(data.franchises ?? []);
    setMonthCount(data.monthCount ?? 0);
    setLoading(false);
  }, [period, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const opt = PERIOD_OPTIONS.find(p => p.id === period);
    setPeriodLabel(opt?.label || "");
  }, [period]);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/master/franchises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm(EMPTY_FORM);
      showToast("Franchise créée!");
      load();
    } else {
      const d = await res.json();
      showToast(`Erreur: ${d.error}`);
    }
    setSaving(false);
  };

  const setStatus = async (id: string, status: string) => {
    await fetch("/api/master/franchises", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    showToast(`Statut mis à jour: ${status}`);
    load();
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const totalRevenue    = franchises.reduce((s, f) => s + f.stats.periodRevenue, 0);
  const totalRoyalties  = franchises.reduce((s, f) => s + f.stats.royaltyDue,    0);
  const totalMonthlyFees = franchises.reduce((s, f) => s + f.stats.monthlyFees,  0);
  const totalDue        = franchises.reduce((s, f) => s + f.stats.totalDue,      0);
  const activeCount     = franchises.filter(f => f.status === "active").length;

  const fmt = (n: number) => n.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (forbidden) {
    return (
      <div className="p-8 text-center">
        <p className="text-xl font-bold text-ink mb-2">Accès refusé</p>
        <p className="text-mut">Réservé au super-admin (franchiseur).</p>
        <Link href="/" className="mt-4 inline-block text-acc hover:underline">Retour</Link>
      </div>
    );
  }

  // Period selector component
  const PeriodSelector = () => (
    <div className="flex items-center gap-3 flex-wrap">
      <CalendarDays size={16} className="text-mut" />
      <select
        value={period}
        onChange={e => setPeriod(e.target.value as Period)}
        className="border border-line rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-acc focus:border-acc outline-none bg-sur"
      >
        {PERIOD_OPTIONS.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {period === "custom" && (
        <>
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="border border-line rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-acc outline-none"
          />
          <span className="text-mut text-sm">→</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="border border-line rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-acc outline-none"
          />
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-page">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 btn-glow text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-sur border-b border-line sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Building2 size={22} className="text-acc" />
              <div>
                <p className="font-bold font-display text-lg leading-tight text-ink">CHLORE<span className="text-acc">.</span></p>
                <p className="lbl">Espace franchiseur</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {MASTER_NAV.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                      active ? "bg-chip text-ink" : "text-mut hover:bg-chip hover:text-ink"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 btn-glow hover:opacity-90 px-4 py-2 rounded-lg text-sm font-semibold transition"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Nouvelle franchise</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tab: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Period selector */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-lg font-bold font-display text-ink">Vue d&apos;ensemble</h2>
              <PeriodSelector />
            </div>

            {/* Global stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Franchises actives",  value: String(activeCount), icon: Building2,  color: "text-acc", bg: "bg-chip" },
                { label: `Revenus (${periodLabel.toLowerCase()})`, value: `${fmt(totalRevenue)} $`, icon: DollarSign, color: "text-pos", bg: "bg-chip" },
                { label: "Redevances dues (8%)", value: `${fmt(totalRoyalties)} $`, icon: DollarSign, color: "text-acc", bg: "bg-chip" },
                { label: `Frais système (${monthCount} mois)`, value: `${fmt(totalMonthlyFees)} $`, icon: Briefcase, color: "text-warn", bg: "bg-chip" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-sur rounded-xl border border-line p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                      <Icon size={16} className={color} />
                    </div>
                    <p className="lbl">{label}</p>
                  </div>
                  <p className={`text-2xl font-bold font-display num ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Franchises list */}
            <div>
              <h2 className="text-lg font-bold font-display text-ink mb-4">
                Franchises ({franchises.length})
              </h2>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-mut" />
                </div>
              ) : (
                <div className="space-y-4">
                  {franchises.map(f => {
                    const badge = STATUS_BADGE[f.status] ?? STATUS_BADGE.pending;
                    const BadgeIcon = badge.icon;
                    return (
                      <div key={f.id} className="bg-sur rounded-xl border border-line overflow-hidden hover:border-acc transition">
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap mb-1">
                                <h3 className="font-bold font-display text-ink text-lg">{f.name}</h3>
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                                  <BadgeIcon size={11} />
                                  {badge.label}
                                </span>
                                {!f.franchise_fee_paid && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-chip text-neg border border-line">
                                    Frais initial non payé
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-mut mt-2">
                                {f.owner_name  && <span className="flex items-center gap-1"><Users size={13} /> {f.owner_name}</span>}
                                {f.owner_email && <span>{f.owner_email}</span>}
                                {f.owner_phone && <span>{f.owner_phone}</span>}
                                {f.territory   && <span>{f.territory}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <a
                                href={`/${f.slug || f.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg btn-glow hover:opacity-90 font-medium transition"
                              >
                                <LogIn size={14} />
                                Ouvrir le CRM
                              </a>
                              {f.status !== "active" && (
                                <button
                                  onClick={() => setStatus(f.id, "active")}
                                  className="text-sm px-4 py-2 rounded-lg bg-chip text-pos hover:opacity-80 font-medium"
                                >
                                  Activer
                                </button>
                              )}
                              {f.status === "active" && (
                                <button
                                  onClick={() => setStatus(f.id, "suspended")}
                                  className="text-sm px-3 py-2 rounded-lg bg-chip text-neg hover:opacity-80 font-medium border border-line"
                                >
                                  Suspendre
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Stats row */}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t border-line">
                            {[
                              { label: "Clients",       value: String(f.stats.clientCount) },
                              { label: "Jobs actifs",   value: String(f.stats.activeJobCount) },
                              { label: "Revenus",       value: `${fmt(f.stats.periodRevenue)} $` },
                              { label: "Redevance 8%",  value: `${fmt(f.stats.royaltyDue)} $` },
                              { label: "Total dû",     value: `${fmt(f.stats.totalDue)} $` },
                            ].map(({ label, value }) => (
                              <div key={label}>
                                <p className="lbl">{label}</p>
                                <p className="text-lg font-semibold font-display num text-ink">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Billing */}
        {activeTab === "billing" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-lg font-bold font-display text-ink">Facturation</h2>
              <PeriodSelector />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-sur rounded-xl border border-line p-5">
                <p className="lbl mb-1">Revenus totaux</p>
                <p className="text-2xl font-bold font-display num text-pos">{fmt(totalRevenue)} $</p>
              </div>
              <div className="bg-sur rounded-xl border border-line p-5">
                <p className="lbl mb-1">Redevances (8%)</p>
                <p className="text-2xl font-bold font-display num text-acc">{fmt(totalRoyalties)} $</p>
              </div>
              <div className="bg-sur rounded-xl border border-line p-5">
                <p className="lbl mb-1">Frais système ({monthCount} mois)</p>
                <p className="text-2xl font-bold font-display num text-warn">{fmt(totalMonthlyFees)} $</p>
              </div>
              <div className="bg-sur rounded-xl border border-line p-5">
                <p className="lbl mb-1">Total à percevoir</p>
                <p className="text-2xl font-bold font-display num text-acc">{fmt(totalDue)} $</p>
              </div>
            </div>

            {/* Per-franchise billing table */}
            <div className="bg-sur rounded-xl border border-line overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-page">
                    <tr>
                      {["Franchise", "Revenus", "Redevance 8%", `Frais système (${monthCount} mois)`, "Total dû", "Statut"].map(h => (
                        <th key={h} className="px-5 py-3 text-left lbl">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {franchises.map(f => (
                      <tr key={f.id} className="hover:bg-chip">
                        <td className="px-5 py-4 text-sm font-medium text-ink">{f.name}</td>
                        <td className="px-5 py-4 text-sm num text-ink">{fmt(f.stats.periodRevenue)} $</td>
                        <td className="px-5 py-4 text-sm num text-acc font-medium">{fmt(f.stats.royaltyDue)} $</td>
                        <td className="px-5 py-4 text-sm num text-warn font-medium">{fmt(f.stats.monthlyFees)} $</td>
                        <td className="px-5 py-4 text-sm font-bold num text-ink">{fmt(f.stats.totalDue)} $</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[f.status]?.bg ?? ""} ${STATUS_BADGE[f.status]?.text ?? ""}`}>
                            {STATUS_BADGE[f.status]?.label ?? f.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-page border-t-2 border-line">
                    <tr>
                      <td className="px-5 py-3 text-sm font-bold text-ink">Total</td>
                      <td className="px-5 py-3 text-sm font-bold num text-ink">{fmt(totalRevenue)} $</td>
                      <td className="px-5 py-3 text-sm font-bold num text-acc">{fmt(totalRoyalties)} $</td>
                      <td className="px-5 py-3 text-sm font-bold num text-warn">{fmt(totalMonthlyFees)} $</td>
                      <td className="px-5 py-3 text-sm font-bold num text-ink">{fmt(totalDue)} $</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-chip border border-line rounded-xl p-4 text-xs text-mut space-y-1">
              <p className="font-semibold text-ink">Structure tarifaire</p>
              <p>Redevance: 8% des revenus mensuels de la franchise</p>
              <p>Frais système: 200 $/mois par franchise active</p>
              <p>Frais initial: 10 000 $ (unique, à l&apos;ouverture)</p>
              <p className="mt-2 text-acc">Début de saison: 1er avril {new Date().getFullYear()}</p>
            </div>
          </div>
        )}

        {/* Tab: Settings */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display text-ink">Réglages globaux</h2>
            <div className="bg-sur rounded-xl border border-line p-6">
              <p className="text-sm text-mut">Les réglages globaux (prix des services par défaut, system prompt du bot) seront disponibles ici.</p>
              <p className="text-xs text-mut mt-2">Cette section est en développement.</p>
            </div>
          </div>
        )}
      </main>

      {/* Create franchise modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sur border border-line rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-sur px-6 py-4 border-b border-line flex items-center justify-between rounded-t-2xl">
              <h2 className="font-bold font-display text-ink text-lg">Nouvelle franchise</h2>
              <button onClick={() => setShowForm(false)} className="text-mut hover:text-ink">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <p className="lbl mb-3">Infos de base</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-mut block mb-1">Nom de la franchise *</label>
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="ex: Entretien Piscine Sherbrooke"
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Nom du propriétaire</label>
                    <input value={form.owner_name} onChange={e => setForm(p => ({ ...p, owner_name: e.target.value }))}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Email du propriétaire</label>
                    <input type="email" value={form.owner_email} onChange={e => setForm(p => ({ ...p, owner_email: e.target.value }))}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Mot de passe (accès CRM)</label>
                    <input type="password" value={form.owner_password} onChange={e => setForm(p => ({ ...p, owner_password: e.target.value }))}
                      placeholder="Mot de passe initial du franchisé"
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Téléphone du propriétaire</label>
                    <input value={form.owner_phone} onChange={e => setForm(p => ({ ...p, owner_phone: e.target.value }))}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Territoire</label>
                    <input value={form.territory} onChange={e => setForm(p => ({ ...p, territory: e.target.value }))}
                      placeholder="ex: Sherbrooke et environs"
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Email entreprise</label>
                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                </div>
              </div>

              <div>
                <p className="lbl mb-1">Twilio (optionnel)</p>
                <p className="text-xs text-mut mb-3">Le auth_token sera chiffré AES-256-GCM.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-mut block mb-1">Account SID</label>
                    <input value={form.twilio_account_sid} onChange={e => setForm(p => ({ ...p, twilio_account_sid: e.target.value }))}
                      placeholder="ACxxxxxxxxx"
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div>
                    <label className="text-xs text-mut block mb-1">Auth Token</label>
                    <input type="password" value={form.twilio_auth_token} onChange={e => setForm(p => ({ ...p, twilio_auth_token: e.target.value }))}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-mut block mb-1">Numéro Twilio</label>
                    <input value={form.twilio_phone_number} onChange={e => setForm(p => ({ ...p, twilio_phone_number: e.target.value }))}
                      placeholder="+15141234567"
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-acc" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-line rounded-lg text-sm text-mut hover:bg-chip">
                  Annuler
                </button>
                <button onClick={save} disabled={!form.name || saving}
                  className="flex-1 btn-glow px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Créer la franchise
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
