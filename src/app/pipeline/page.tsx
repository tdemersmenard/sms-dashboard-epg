"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { usePipeline } from "@/hooks/usePipeline";
import PipelineBoard from "@/components/Pipeline/PipelineBoard";

const SERVICES_OPTIONS = ["ouverture", "entretien", "fermeture"];
const SOURCE_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "appel", label: "Appel entrant" },
  { value: "referral", label: "Référence" },
  { value: "site_web", label: "Site web" },
];

export default function PipelinePage() {
  const { byStage, loading, updateStage, createContact } = usePipeline();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address: "",
    pool_type: "" as "" | "hors-terre" | "creusée",
    services: [] as string[],
    lead_source: "",
    season_price: "",
  });

  const set = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleService = (s: string) =>
    set(
      "services",
      form.services.includes(s)
        ? form.services.filter((x) => x !== s)
        : [...form.services, s]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim()) return;
    setSaving(true);
    try {
      await createContact({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        phone: form.phone.trim(),
        email: form.email || null,
        address: form.address || null,
        pool_type: (form.pool_type as "hors-terre" | "creusée") || null,
        services: form.services,
        lead_source: form.lead_source || null,
        season_price: form.season_price ? parseFloat(form.season_price) : null,
        stage: "nouveau",
      });
      setShowModal(false);
      setForm({
        first_name: "", last_name: "", phone: "", email: "", address: "",
        pool_type: "", services: [], lead_source: "", season_price: "",
      });
    } catch (err) {
      console.error("createContact:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] transition"
        >
          <Plus size={16} />
          Nouveau lead
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden pt-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <PipelineBoard byStage={byStage} onDragEnd={updateStage} />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Nouveau lead</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Prénom</label>
                  <input
                    type="text" value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Nom</label>
                  <input
                    type="text" value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Téléphone *</label>
                <input
                  type="tel" value={form.phone} required
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+14501234567"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
                <input
                  type="email" value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Adresse</label>
                <input
                  type="text" value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Type de piscine</label>
                  <select
                    value={form.pool_type}
                    onChange={(e) => set("pool_type", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">—</option>
                    <option value="hors-terre">Hors-terre</option>
                    <option value="creusée">Creusée</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Source</label>
                  <select
                    value={form.lead_source}
                    onChange={(e) => set("lead_source", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">—</option>
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Services</label>
                <div className="flex gap-3">
                  {SERVICES_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.services.includes(s)}
                        onChange={() => toggleService(s)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">{s}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Prix saison ($)</label>
                <input
                  type="number" min="0" step="0.01" value={form.season_price}
                  onChange={(e) => set("season_price", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit" disabled={saving}
                  className="px-5 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
                >
                  {saving ? "Création..." : "Créer le lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
