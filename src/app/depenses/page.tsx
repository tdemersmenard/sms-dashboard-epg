"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Receipt } from "lucide-react";
import { fetchDepenses, Depense, CATS, montantDeductible, fmt } from "@/lib/depenses";
import { getVehicleDeduction } from "@/lib/depenses-deduction";
import DepenseForm from "@/components/depenses/DepenseForm";
import DepenseTable from "@/components/depenses/DepenseTable";
import CatCards from "@/components/depenses/CatCards";
import RapportFiscal from "@/components/depenses/RapportFiscal";

type Tab = "liste" | "categories" | "rapport";

const TABS: { id: Tab; label: string }[] = [
  { id: "liste",      label: "Liste des dépenses" },
  { id: "categories", label: "Par catégorie"       },
  { id: "rapport",    label: "Rapport fiscal"      },
];

const ANNEES = [2024, 2025, 2026, 2027];

export default function DepensesPage() {
  const [tab, setTab] = useState<Tab>("liste");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDepenses(annee);
      setDepenses(data);
    } catch (err) {
      console.error("[depenses] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [annee]);

  useEffect(() => { load(); }, [load]);

  // ── Quick stats ───────────────────────────────────────────────
  const totalMontant = depenses.reduce((s, d) => s + d.montant, 0);
  const totalDeductible = depenses.reduce((s, d) => {
    const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
    return s + montantDeductible(d.montant, pct);
  }, 0);
  const nbRecus = depenses.filter((d) => d.recu_url).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Receipt size={22} className="text-[#0a1f3f]" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dépenses Business</h1>
            <p className="text-sm text-gray-500">Suivi des dépenses déductibles — Québec</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            {ANNEES.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] transition"
          >
            <Plus size={16} />
            Ajouter
          </button>
        </div>
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Total dépenses</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalMontant)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Total déductible</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalDeductible)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Entrées</p>
          <p className="text-2xl font-bold text-gray-900">{depenses.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Reçus attachés</p>
          <p className="text-2xl font-bold text-gray-900">
            {nbRecus}
            <span className="text-base font-normal text-gray-400"> / {depenses.length}</span>
          </p>
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="mb-6">
          <DepenseForm
            annee={annee}
            onCreated={() => { setShowForm(false); load(); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 mb-5 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-[#0a1f3f] text-[#0a1f3f]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === "liste"      && <DepenseTable depenses={depenses} onDeleted={load} />}
          {tab === "categories" && <CatCards depenses={depenses} />}
          {tab === "rapport"    && <RapportFiscal depenses={depenses} annee={annee} />}
        </>
      )}
    </div>
  );
}
