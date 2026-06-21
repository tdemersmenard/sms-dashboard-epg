"use client";

import { useState, useEffect } from "react";
import { Building2, Plus, Check, Clock, XCircle, DollarSign, Users, Briefcase, Loader2, X, ChevronRight, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string; icon: typeof Check }> = {
  active:    { label: "Active",    bg: "bg-green-100",  text: "text-green-700",  icon: Check    },
  pending:   { label: "En attente", bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock    },
  suspended: { label: "Suspendue", bg: "bg-red-100",    text: "text-red-700",    icon: XCircle  },
};

interface FranchiseStat {
  id: string;
  name: string;
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
    monthRevenue: number;
    royaltyDue: number;
    monthlyFee: number;
    totalDue: number;
  };
}

const EMPTY_FORM = {
  name: "", owner_name: "", owner_email: "", owner_phone: "",
  territory: "", business_address: "",
  twilio_account_sid: "", twilio_auth_token: "", twilio_phone_number: "",
  email: "", payment_interac_email: "",
  owner_password: "",
};

export default function MasterPage() {
  const router = useRouter();
  const [franchises, setFranchises] = useState<FranchiseStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [entering, setEntering] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/master/franchises");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setFranchises(data.franchises ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

  const enterFranchise = async (franchiseId: string) => {
    setEntering(franchiseId);
    await fetch("/api/master/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ franchiseId }),
    });
    router.push("/dashboard");
    router.refresh();
  };

  const totalMonthRevenue = franchises.reduce((s, f) => s + f.stats.monthRevenue, 0);
  const totalRoyalties    = franchises.reduce((s, f) => s + f.stats.royaltyDue,   0);
  const totalMonthlyFees  = franchises.reduce((s, f) => s + f.stats.monthlyFee,   0);
  const activeCount       = franchises.filter(f => f.status === "active").length;

  if (forbidden) {
    return (
      <div className="p-8 text-center">
        <p className="text-xl font-bold text-gray-800 mb-2">Accès refusé</p>
        <p className="text-gray-500">Réservé au super-admin (franchiseur).</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">Retour au dashboard</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0a1f3f] text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Building2 size={22} className="text-[#0a1f3f]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Master — Franchises</h1>
            <p className="text-sm text-gray-500">{activeCount} franchise{activeCount !== 1 ? "s" : ""} active{activeCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-[#0a1f3f] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#0d2a52] transition"
        >
          <Plus size={16} /> Nouvelle franchise
        </button>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Franchises actives",  value: activeCount,                           icon: Building2,  color: "text-[#0a1f3f]" },
          { label: "Revenus du mois",     value: `${totalMonthRevenue.toLocaleString("fr-CA")} $`, icon: DollarSign, color: "text-green-600" },
          { label: "Redevances dues (8%)", value: `${totalRoyalties.toLocaleString("fr-CA")} $`,  icon: DollarSign, color: "text-blue-600" },
          { label: "Frais système",        value: `${totalMonthlyFees.toLocaleString("fr-CA")} $`, icon: Briefcase,  color: "text-orange-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={16} className={color} />
              <p className="text-xs text-gray-500 font-medium">{label}</p>
            </div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Franchises list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {franchises.map(f => {
            const badge = STATUS_BADGE[f.status] ?? STATUS_BADGE.pending;
            const BadgeIcon = badge.icon;
            return (
              <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <h2 className="font-bold text-gray-900">{f.name}</h2>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                          <BadgeIcon size={11} />
                          {badge.label}
                        </span>
                        {!f.franchise_fee_paid && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                            Frais initial non payé
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-1">
                        {f.owner_name  && <span>👤 {f.owner_name}</span>}
                        {f.owner_email && <span>✉ {f.owner_email}</span>}
                        {f.owner_phone && <span>📞 {f.owner_phone}</span>}
                        {f.territory   && <span>📍 {f.territory}</span>}
                        {f.twilio_phone_number && <span>📱 {f.twilio_phone_number}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => enterFranchise(f.id)}
                        disabled={entering === f.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0a1f3f] text-white hover:bg-[#0d2a52] font-medium transition disabled:opacity-60"
                      >
                        {entering === f.id ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                        Entrer
                      </button>
                      {f.status !== "active" && (
                        <button
                          onClick={() => setStatus(f.id, "active")}
                          className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium"
                        >
                          Activer
                        </button>
                      )}
                      {f.status === "active" && (
                        <button
                          onClick={() => setStatus(f.id, "suspended")}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium border border-red-200"
                        >
                          Suspendre
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-100">
                    {[
                      { label: "Clients",     value: f.stats.clientCount },
                      { label: "Jobs actifs", value: f.stats.activeJobCount },
                      { label: "Rev. mois",   value: `${f.stats.monthRevenue.toLocaleString("fr-CA")} $` },
                      { label: "Redevance",   value: `${f.stats.royaltyDue.toLocaleString("fr-CA")} $` },
                      { label: "Total dû",    value: `${f.stats.totalDue.toLocaleString("fr-CA")} $` },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="font-semibold text-gray-800">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create franchise modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">Nouvelle franchise</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Infos de base */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Infos de base</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Nom de la franchise *</label>
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="ex: Entretien Piscine Sherbrooke"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Nom du propriétaire</label>
                    <input value={form.owner_name} onChange={e => setForm(p => ({ ...p, owner_name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Email du propriétaire</label>
                    <input type="email" value={form.owner_email} onChange={e => setForm(p => ({ ...p, owner_email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Mot de passe (accès CRM)</label>
                    <input type="password" value={form.owner_password} onChange={e => setForm(p => ({ ...p, owner_password: e.target.value }))}
                      placeholder="Mot de passe initial du franchisé"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Téléphone du propriétaire</label>
                    <input value={form.owner_phone} onChange={e => setForm(p => ({ ...p, owner_phone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Territoire</label>
                    <input value={form.territory} onChange={e => setForm(p => ({ ...p, territory: e.target.value }))}
                      placeholder="ex: Sherbrooke et environs"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Email entreprise</label>
                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                </div>
              </div>

              {/* Twilio */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Twilio (optionnel — configurer après)</p>
                <p className="text-xs text-gray-400 mb-3">Le auth_token sera chiffré AES-256-GCM. La franchise peut aussi le configurer elle-même.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Account SID</label>
                    <input value={form.twilio_account_sid} onChange={e => setForm(p => ({ ...p, twilio_account_sid: e.target.value }))}
                      placeholder="ACxxxxxxxxx"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Auth Token</label>
                    <input type="password" value={form.twilio_auth_token} onChange={e => setForm(p => ({ ...p, twilio_auth_token: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Numéro Twilio</label>
                    <input value={form.twilio_phone_number} onChange={e => setForm(p => ({ ...p, twilio_phone_number: e.target.value }))}
                      placeholder="+15141234567"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={save} disabled={!form.name || saving}
                  className="flex-1 bg-[#0a1f3f] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#0d2a52] disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Créer la franchise
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold mb-1">Phase 1 — Fondations multi-tenant</p>
        <p>• Chaque franchise a son propre CRM isolé (franchise_id sur toutes les tables)</p>
        <p>• Les credentials Twilio sont chiffrés AES-256-GCM (env var ENCRYPTION_KEY requise)</p>
        <p>• Le webhook route automatiquement les SMS entrants vers la bonne franchise via le numéro To</p>
        <p className="font-medium mt-2 text-blue-800">→ <a href="/master/franchises" className="underline">Configurer les franchises</a></p>
      </div>
    </div>
  );
}
