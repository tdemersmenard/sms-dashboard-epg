"use client";

import { FileText } from "lucide-react";
import { Depense, CATS, CatInfo, CategorieDepense, montantDeductible, fmt } from "@/lib/depenses";

interface Props {
  depenses: Depense[];
}

interface CatRow {
  key: CategorieDepense;
  cat: CatInfo;
  items: Depense[];
  totalMontant: number;
  totalDeductible: number;
  nbRecus: number;
}

export default function CatCards({ depenses }: Props) {
  const bycat: CatRow[] = (Object.keys(CATS) as CategorieDepense[])
    .map((key): CatRow | null => {
      const cat = CATS[key];
      const items = depenses.filter((d) => d.categorie === key);
      if (items.length === 0) return null;
      const totalMontant = items.reduce((s, d) => s + d.montant, 0);
      const totalDeductible = items.reduce(
        (s, d) => s + montantDeductible(d.montant, cat.pct),
        0
      );
      const nbRecus = items.filter((d) => d.recu_url).length;
      return { key, cat, items, totalMontant, totalDeductible, nbRecus };
    })
    .filter((x): x is CatRow => x !== null);

  if (bycat.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
        Aucune dépense pour cette période.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {bycat.map(({ key, cat, items, totalMontant, totalDeductible, nbRecus }) => (
        <div key={key} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cat.tailwindBg} ${cat.tailwindText}`}
            >
              {cat.label}
            </span>
            <span className="text-xs text-gray-400">{cat.pct}% déd.</span>
          </div>

          <p className="text-2xl font-bold text-gray-900 mb-0.5">{fmt(totalMontant)}</p>
          <p className="text-sm font-medium text-green-600">{fmt(totalDeductible)} déductible</p>

          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
            <span>
              {items.length} dépense{items.length > 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <FileText size={11} />
              {nbRecus}/{items.length} reçus
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
