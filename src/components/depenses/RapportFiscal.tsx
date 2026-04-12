"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";
import {
  Depense, CATS, CategorieDepense,
  montantDeductible, fmt, TAUX_MARGINAL,
} from "@/lib/depenses";

interface Props {
  depenses: Depense[];
  annee: number;
}

export default function RapportFiscal({ depenses, annee }: Props) {
  const [copied, setCopied] = useState(false);

  const totalMontant = depenses.reduce((s, d) => s + d.montant, 0);
  const totalDeductible = depenses.reduce(
    (s, d) => s + montantDeductible(d.montant, CATS[d.categorie].pct),
    0
  );
  const totalEconomie = totalDeductible * TAUX_MARGINAL;
  const nbRecus = depenses.filter((d) => d.recu_url).length;
  const sansRecu = depenses.filter((d) => !d.recu_url);

  const bycat = (Object.keys(CATS) as CategorieDepense[])
    .map((key) => {
      const cat = CATS[key];
      const items = depenses.filter((d) => d.categorie === key);
      if (items.length === 0) return null;
      const totalM = items.reduce((s, d) => s + d.montant, 0);
      const totalD = items.reduce((s, d) => s + montantDeductible(d.montant, cat.pct), 0);
      return { key, cat, count: items.length, totalM, totalD };
    })
    .filter(Boolean) as {
      key: CategorieDepense;
      cat: (typeof CATS)[CategorieDepense];
      count: number;
      totalM: number;
      totalD: number;
    }[];

  const handleCopy = () => {
    const lines = [
      `RAPPORT FISCAL ${annee} — Entretien Piscine Granby`,
      `Préparé le ${new Date().toLocaleDateString("fr-CA")}`,
      "",
      "=== RÉSUMÉ ===",
      `Total dépenses       : ${fmt(totalMontant)}`,
      `Total déductible     : ${fmt(totalDeductible)}`,
      `Économie d'impôt est.: ${fmt(totalEconomie)} (taux ~${Math.round(TAUX_MARGINAL * 100)}%)`,
      `Reçus attachés       : ${nbRecus}/${depenses.length}`,
      "",
      "=== PAR CATÉGORIE ===",
      ...bycat.map(
        (x) =>
          `${x.cat.label.padEnd(22)} ${fmt(x.totalM).padStart(10)} → ${fmt(x.totalD).padStart(10)} déductible  (${x.count} dép.)`
      ),
    ];

    if (sansRecu.length > 0) {
      lines.push("");
      lines.push(`⚠️  ${sansRecu.length} dépense(s) sans reçu :`);
      sansRecu.forEach((d) =>
        lines.push(`   - ${d.date}  |  ${d.description}  |  ${fmt(d.montant)}`)
      );
    }

    navigator.clipboard.writeText(lines.join("\n")).catch(console.error);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (depenses.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
        Aucune dépense pour cette période.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert reçus manquants */}
      {sansRecu.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {sansRecu.length} dépense{sansRecu.length > 1 ? "s" : ""} sans reçu attaché
            </p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              {sansRecu.map((d) => d.description).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Total dépenses {annee}</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalMontant)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Total déductible</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalDeductible)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Économie d&apos;impôt estimée</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalEconomie)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            taux marginal ~{Math.round(TAUX_MARGINAL * 100)}%
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Reçus attachés</p>
          <p className="text-2xl font-bold text-gray-900">
            {nbRecus}
            <span className="text-base font-normal text-gray-400"> / {depenses.length}</span>
          </p>
        </div>
      </div>

      {/* Recap table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Récapitulatif par catégorie</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Catégorie</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Nb dép.</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">% Déd.</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Total dépensé</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500">Total déductible</th>
              </tr>
            </thead>
            <tbody>
              {bycat.map(({ key, cat, count, totalM, totalD }) => (
                <tr key={key} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-3">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cat.tailwindBg} ${cat.tailwindText}`}
                    >
                      {cat.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{count}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{cat.pct}%</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(totalM)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-green-700">{fmt(totalD)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                <td className="px-5 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-center text-gray-900">{depenses.length}</td>
                <td />
                <td className="px-4 py-3 text-right text-gray-900">{fmt(totalMontant)}</td>
                <td className="px-5 py-3 text-right text-green-700">{fmt(totalDeductible)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] transition"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Copié !" : "Copier le rapport (pour comptable)"}
      </button>
    </div>
  );
}
