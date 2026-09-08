"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
import type { Contact } from "@/lib/types";

const STAGES = [
  "nouveau", "contacté", "soumission envoyée", "closé",
  "planifié", "complété", "perdu",
] as const;

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "nouveau":            { bg: "bg-acc/10",        text: "text-acc" },
  "contacté":           { bg: "bg-yellow-500/15", text: "text-yellow-600" },
  "soumission envoyée": { bg: "bg-orange-500/15", text: "text-orange-600" },
  "closé":              { bg: "bg-pos/10",        text: "text-pos" },
  "planifié":           { bg: "bg-purple-500/15", text: "text-purple-600" },
  "complété":           { bg: "bg-chip",          text: "text-ink" },
  "perdu":              { bg: "bg-neg/10",        text: "text-neg" },
};

function displayName(c: Contact): string {
  const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
  const last = c.last_name && c.last_name.trim() !== "" ? c.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (c.name && c.name !== "Inconnu") return c.name;
  return c.phone ?? "Inconnu";
}

export default function ClientsPage() {
  const router = useRouter();
  const { franchiseId } = useFranchise();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [poolFilter, setPoolFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", phone: "", email: "", address: "",
    pool_type: "" as "" | "hors-terre" | "creusée",
    lead_source: "",
    services: [] as string[],
    season_price: "",
  });

  const SERVICES_OPTIONS = ["ouverture", "entretien", "fermeture"];
  const SOURCE_OPTIONS = [
    { value: "facebook", label: "Facebook" },
    { value: "appel", label: "Appel entrant" },
    { value: "referral", label: "Référence" },
    { value: "site_web", label: "Site web" },
  ];

  const toggleService = (s: string) =>
    setForm((p) => ({
      ...p,
      services: p.services.includes(s)
        ? p.services.filter((x) => x !== s)
        : [...p.services, s],
    }));

  useEffect(() => {
    if (!franchiseId) return;
    supabaseBrowser
      .from("contacts")
      .select("*")
      .eq("franchise_id", franchiseId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setContacts((data ?? []) as Contact[]);
        setLoading(false);
      });
  }, [franchiseId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const name = displayName(c).toLowerCase();
      const matchSearch =
        !q ||
        name.includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.address ?? "").toLowerCase().includes(q);
      const matchStage = !stageFilter || (c.stage ?? "nouveau") === stageFilter;
      const matchPool = !poolFilter || c.pool_type === poolFilter;
      return matchSearch && matchStage && matchPool;
    });
  }, [contacts, search, stageFilter, poolFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim()) return;
    setSaving(true);
    const { data } = await supabaseBrowser
      .from("contacts")
      .insert({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        phone: form.phone.trim(),
        email: form.email || null,
        address: form.address || null,
        pool_type: form.pool_type || null,
        lead_source: form.lead_source || null,
        services: form.services,
        season_price: form.season_price ? parseFloat(form.season_price) : null,
        stage: "nouveau",
        has_spa: false,
        ...(franchiseId ? { franchise_id: franchiseId } : {}),
      })
      .select()
      .single();
    if (data) {
      setContacts((prev) => [data as Contact, ...prev]);
      setShowModal(false);
      setForm({ first_name: "", last_name: "", phone: "", email: "", address: "", pool_type: "", lead_source: "", services: [], season_price: "" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-line border-t-acc rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-xl font-bold font-display text-ink flex-shrink-0">Clients</h1>
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, adresse..."
            className="w-full pl-9 pr-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 btn-glow text-sm font-medium rounded-lg hover:opacity-90 transition flex-shrink-0"
        >
          <Plus size={16} />
          Nouveau client
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 items-center">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
        >
          <option value="">Tous les stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={poolFilter}
          onChange={(e) => setPoolFilter(e.target.value)}
          className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
        >
          <option value="">Tous les types</option>
          <option value="hors-terre">Hors-terre</option>
          <option value="creusée">Creusée</option>
        </select>
        <span className="text-sm text-mut">
          {filtered.length} client{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-mut text-sm">Aucun client trouvé</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const stage = c.stage ?? "nouveau";
            const sc = STAGE_COLORS[stage];
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/clients/${c.id}`)}
                className="bg-sur rounded-xl border border-line p-4 cursor-pointer hover:border-acc/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-ink leading-tight">{displayName(c)}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${sc?.bg ?? "bg-chip"} ${sc?.text ?? "text-mut"}`}>
                    {stage}
                  </span>
                </div>
                <p className="text-sm text-mut mb-1">{c.phone}</p>
                {c.address && (
                  <p className="text-xs text-mut mb-2 truncate">{c.address}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-1 flex-wrap">
                    {c.pool_type && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        c.pool_type === "hors-terre"
                          ? "bg-chip text-acc"
                          : "bg-chip text-pos"
                      }`}>
                        {c.pool_type === "hors-terre" ? "Hors-terre" : "Creusée"}
                      </span>
                    )}
                  </div>
                  {c.season_price != null && (
                    <p className="text-sm font-bold text-ink num">
                      {c.season_price.toLocaleString("fr-CA", {
                        style: "currency", currency: "CAD", maximumFractionDigits: 0,
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-sur rounded-xl border border-line w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-base font-bold font-display text-ink">Nouveau client</h2>
              <button onClick={() => setShowModal(false)} className="text-mut hover:text-ink text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleCreate} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-mut mb-1 block">Prénom</label>
                  <input
                    type="text" value={form.first_name}
                    onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-mut mb-1 block">Nom</label>
                  <input
                    type="text" value={form.last_name}
                    onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Téléphone *</label>
                <input
                  type="tel" value={form.phone} required
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+14501234567"
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Email</label>
                <input
                  type="email" value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Adresse</label>
                <input
                  type="text" value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-mut mb-1 block">Type de piscine</label>
                  <select
                    value={form.pool_type}
                    onChange={(e) => setForm((p) => ({ ...p, pool_type: e.target.value as typeof p.pool_type }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  >
                    <option value="">—</option>
                    <option value="hors-terre">Hors-terre</option>
                    <option value="creusée">Creusée</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-mut mb-1 block">Source</label>
                  <select
                    value={form.lead_source}
                    onChange={(e) => setForm((p) => ({ ...p, lead_source: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  >
                    <option value="">—</option>
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1.5 block">Services</label>
                <div className="flex gap-3">
                  {SERVICES_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.services.includes(s)}
                        onChange={() => toggleService(s)}
                        className="rounded"
                      />
                      <span className="text-sm text-ink">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Prix saison ($)</label>
                <input
                  type="number" min="0" step="0.01" value={form.season_price}
                  onChange={(e) => setForm((p) => ({ ...p, season_price: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-mut hover:text-ink transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 btn-glow text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition">
                  {saving ? "Création..." : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
