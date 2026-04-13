"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ArrowRight, Trash2, TrendingUp, TrendingDown } from "lucide-react";

const CATEGORIES = [
  { value: "salaire",               label: "Salaire",                   color: "bg-green-100 text-green-700"  },
  { value: "remboursement_depense", label: "Remboursement dépense",     color: "bg-blue-100 text-blue-700"    },
  { value: "investissement",        label: "Investissement business",   color: "bg-purple-100 text-purple-700"},
  { value: "retrait_profit",        label: "Retrait de profit",         color: "bg-amber-100 text-amber-700"  },
  { value: "avance",                label: "Avance temporaire",         color: "bg-orange-100 text-orange-700"},
  { value: "autre",                 label: "Autre",                     color: "bg-gray-100 text-gray-700"    },
];

export default function TransfertsTab() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [transferts, setTransferts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    montant: "",
    direction: "business_to_perso" as "business_to_perso" | "perso_to_business",
    categorie: "salaire",
    description: "",
    note: "",
    compte_source: "",
    compte_destination: "",
  });
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabaseBrowser
      .from("transferts")
      .select("*")
      .eq("annee", yearFilter)
      .order("date", { ascending: false });
    setTransferts(data || []);
    setLoading(false);
  }, [yearFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.montant || !form.date) {
      alert("Date et montant requis");
      return;
    }
    await supabaseBrowser.from("transferts").insert({
      date: form.date,
      montant: parseFloat(form.montant),
      direction: form.direction,
      categorie: form.categorie,
      description: form.description || null,
      note: form.note || null,
      compte_source: form.compte_source || null,
      compte_destination: form.compte_destination || null,
    });
    setForm({
      date: new Date().toISOString().split("T")[0],
      montant: "",
      direction: "business_to_perso",
      categorie: "salaire",
      description: "",
      note: "",
      compte_source: "",
      compte_destination: "",
    });
    setShowForm(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce transfert?")) return;
    await supabaseBrowser.from("transferts").delete().eq("id", id);
    await load();
  };

  // Stats
  const totalPersoRecu = transferts
    .filter(t => t.direction === "business_to_perso")
    .reduce((s, t) => s + parseFloat(t.montant), 0);
  const totalPersoDonne = transferts
    .filter(t => t.direction === "perso_to_business")
    .reduce((s, t) => s + parseFloat(t.montant), 0);
  const netPerso = totalPersoRecu - totalPersoDonne;

  // Par mois
  const parMois: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) parMois[m] = 0;
  transferts.forEach(t => {
    const sign = t.direction === "business_to_perso" ? 1 : -1;
    parMois[t.mois] += parseFloat(t.montant) * sign;
  });

  const fmtMontant = (n: number) => `${n.toFixed(2)}$`;
  const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-700">
            <TrendingUp size={16} />
            <p className="text-xs font-medium">Reçu en perso</p>
          </div>
          <p className="text-2xl font-bold text-green-900 mt-1">{fmtMontant(totalPersoRecu)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-700">
            <TrendingDown size={16} />
            <p className="text-xs font-medium">Injecté dans business</p>
          </div>
          <p className="text-2xl font-bold text-orange-900 mt-1">{fmtMontant(totalPersoDonne)}</p>
        </div>
        <div className="bg-[#0a1f3f] rounded-xl p-4 text-white">
          <p className="text-xs font-medium text-blue-200">Net personnel</p>
          <p className="text-2xl font-bold mt-1">{fmtMontant(netPerso)}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center justify-between gap-2">
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(parseInt(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value={2026}>2026</option>
          <option value={2025}>2025</option>
          <option value={2024}>2024</option>
        </select>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#0a1f3f] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0d2a52]"
        >
          {showForm ? "Annuler" : "+ Nouveau transfert"}
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Montant ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.montant}
                onChange={(e) => setForm({ ...form, montant: e.target.value })}
                placeholder="1000"
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700">Direction</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setForm({ ...form, direction: "business_to_perso" })}
                className={`p-3 rounded-lg border text-xs font-medium ${form.direction === "business_to_perso" ? "bg-green-50 border-green-400 text-green-700" : "bg-white border-gray-200 text-gray-600"}`}
              >
                Business → Perso
              </button>
              <button
                onClick={() => setForm({ ...form, direction: "perso_to_business" })}
                className={`p-3 rounded-lg border text-xs font-medium ${form.direction === "perso_to_business" ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-gray-200 text-gray-600"}`}
              >
                Perso → Business
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700">Catégorie</label>
            <select
              value={form.categorie}
              onChange={(e) => setForm({ ...form, categorie: e.target.value })}
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Compte source</label>
              <input
                type="text"
                value={form.compte_source}
                onChange={(e) => setForm({ ...form, compte_source: e.target.value })}
                placeholder="Desjardins business"
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Compte destination</label>
              <input
                type="text"
                value={form.compte_destination}
                onChange={(e) => setForm({ ...form, compte_destination: e.target.value })}
                placeholder="BNC chèques"
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Salaire avril 2026"
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700">Note (optionnel)</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-[#0a1f3f] text-white rounded-lg py-2.5 font-medium"
          >
            Enregistrer le transfert
          </button>
        </div>
      )}

      {/* Graph par mois simple */}
      <div className="bg-white rounded-xl border p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Net personnel par mois</p>
        <div className="space-y-1.5">
          {Object.entries(parMois).map(([m, val]) => (
            <div key={m} className="flex items-center gap-2 text-xs">
              <span className="w-10 text-gray-500">{monthNames[parseInt(m) - 1]}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                <div
                  className={`h-full ${val >= 0 ? "bg-green-500" : "bg-orange-500"}`}
                  style={{ width: `${Math.min(Math.abs(val) / 5000 * 100, 100)}%` }}
                />
              </div>
              <span className={`w-16 text-right font-medium ${val >= 0 ? "text-green-700" : "text-orange-700"}`}>
                {val.toFixed(0)}$
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <p className="font-semibold text-gray-900">Historique ({transferts.length})</p>
        </div>
        <div className="divide-y">
          {loading ? (
            <p className="p-6 text-center text-sm text-gray-500">Chargement...</p>
          ) : transferts.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">Aucun transfert cette année</p>
          ) : (
            transferts.map((t) => {
              const cat = CATEGORIES.find(c => c.value === t.categorie);
              return (
                <div key={t.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{parseFloat(t.montant).toFixed(2)}$</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cat?.color || "bg-gray-100 text-gray-700"}`}>
                        {cat?.label || t.categorie}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <span>{t.compte_source || "Business"}</span>
                      <ArrowRight size={10} />
                      <span>{t.compte_destination || "Perso"}</span>
                    </div>
                    {t.description && <p className="text-xs text-gray-600 mt-1">{t.description}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">{t.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${t.direction === "business_to_perso" ? "text-green-600" : "text-orange-600"}`}>
                      {t.direction === "business_to_perso" ? "→ Perso" : "← Business"}
                    </span>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
