"use client";

import { useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import {
  Depense, CATS, CategorieDepense,
  deleteDepense, montantDeductible, fmt,
} from "@/lib/depenses";
import { getVehicleDeduction } from "@/lib/depenses-deduction";
import RecuModal from "@/components/depenses/RecuModal";

interface Props {
  depenses: Depense[];
  onDeleted: () => void;
}

export default function DepenseTable({ depenses, onDeleted }: Props) {
  const [catFilter, setCatFilter] = useState<CategorieDepense | "all">("all");
  const [recuModal, setRecuModal] = useState<{ url: string; nom: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered =
    catFilter === "all" ? depenses : depenses.filter((d) => d.categorie === catFilter);

  const handleDelete = async (d: Depense) => {
    setDeleting(true);
    try {
      await deleteDepense(d.id, d.recu_url);
      setConfirmDelete(null);
      onDeleted();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setCatFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            catFilter === "all"
              ? "bg-[#0a1f3f] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Toutes
        </button>
        {(Object.keys(CATS) as CategorieDepense[]).map((key) => {
          const cat = CATS[key];
          const count = depenses.filter((d) => d.categorie === key).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setCatFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
                catFilter === key
                  ? `${cat.tailwindBg} ${cat.tailwindText} ring-2 ring-offset-1 ring-current`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.label}
              <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
          Aucune dépense pour cette sélection.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Catégorie</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Montant</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">% Déd.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Déductible</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Reçu</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const cat = CATS[d.categorie];
                  const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : cat.pct;
                  const deductible = montantDeductible(d.montant, pct);
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(d.date + "T12:00:00").toLocaleDateString("fr-CA")}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-900 font-medium">{d.description}</p>
                        {d.note && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{d.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cat.tailwindBg} ${cat.tailwindText}`}
                        >
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {fmt(d.montant)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">
                        {pct}%
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-700 whitespace-nowrap">
                        {fmt(deductible)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.recu_url ? (
                          <button
                            onClick={() =>
                              setRecuModal({ url: d.recu_url!, nom: d.recu_nom || "reçu" })
                            }
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors"
                          >
                            <Eye size={13} /> Voir
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {confirmDelete === d.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(d)}
                              disabled={deleting}
                              className="text-[11px] px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition"
                            >
                              {deleting ? "…" : "Oui"}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-[11px] px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(d.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recuModal && (
        <RecuModal
          url={recuModal.url}
          nom={recuModal.nom}
          onClose={() => setRecuModal(null)}
        />
      )}
    </>
  );
}
