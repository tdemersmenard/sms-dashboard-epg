"use client";

import { useEffect, useState } from "react";
import { Droplets } from "lucide-react";

interface WaterTest {
  id: string;
  ph: number | null;
  alkalinity: number | null;
  chlorine: number | null;
  calcium_hardness: number | null;
  stabilizer: number | null;
  notes: string | null;
  tested_at: string;
}

const PARAMS: { key: keyof WaterTest; label: string; unit: string; min: number; max: number; desc: string }[] = [
  { key: "ph",               label: "pH",              unit: "",    min: 7.2, max: 7.6, desc: "L'acidité de l'eau. Trop bas = eau corrosive, trop haut = chlore inefficace." },
  { key: "alkalinity",       label: "Alcalinité",      unit: "ppm", min: 80,  max: 120, desc: "Stabilise le pH. Évite les variations brusques." },
  { key: "chlorine",         label: "Chlore libre",    unit: "ppm", min: 1,   max: 3,   desc: "Désinfecte l'eau. La valeur la plus importante pour la santé." },
  { key: "calcium_hardness", label: "Dureté calcique", unit: "ppm", min: 200, max: 400, desc: "Empêche l'eau de corroder les surfaces ou de former du calcaire." },
  { key: "stabilizer",       label: "Stabilisant",     unit: "ppm", min: 30,  max: 50,  desc: "Protège le chlore contre les rayons UV du soleil." },
];

function getStatus(val: number | null, min: number, max: number): "ok" | "warn" | "bad" | "none" {
  if (val === null || val === undefined) return "none";
  if (val >= min && val <= max) return "ok";
  if (val < min * 0.75 || val > max * 1.4) return "bad";
  return "warn";
}

const STATUS_CONFIG = {
  ok:   { label: "Normal",       color: "text-green-700", bg: "bg-green-50",  border: "border-green-200" },
  warn: { label: "À surveiller", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  bad:  { label: "Hors norme",   color: "text-red-700",   bg: "bg-red-50",    border: "border-red-200" },
  none: { label: "Non mesuré",   color: "text-gray-400",  bg: "bg-gray-50",   border: "border-gray-200" },
};

export default function PortailAnalysesPage() {
  const [tests, setTests] = useState<WaterTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("portal_token") || "";
    fetch("/api/portail/water-tests", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(r => r.json())
      .then(data => setTests(data.tests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <Droplets size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analyses d&apos;eau</h1>
          <p className="text-sm text-gray-500">Historique des tests de votre piscine</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : tests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <Droplets size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucune analyse enregistrée</p>
          <p className="text-gray-400 text-sm mt-1">Les résultats apparaîtront ici après chaque visite de notre technicien.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map((test, idx) => {
            const hasIssue = PARAMS.some(p => {
              const st = getStatus(test[p.key] as number | null, p.min, p.max);
              return st === "warn" || st === "bad";
            });
            return (
              <div key={test.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{formatDate(test.tested_at)}</p>
                    {idx === 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Dernière analyse</span>}
                  </div>
                  {hasIssue
                    ? <span className="text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded-full">⚠ À surveiller</span>
                    : <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">✓ Tout est normal</span>}
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PARAMS.map(p => {
                    const val = test[p.key] as number | null;
                    const st = getStatus(val, p.min, p.max);
                    const cfg = STATUS_CONFIG[st];
                    return (
                      <div key={p.key} className={`rounded-xl p-3 border ${cfg.bg} ${cfg.border}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-gray-700">{p.label}</p>
                          <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                        </div>
                        <p className={`text-xl font-bold ${cfg.color}`}>
                          {val !== null ? `${val}${p.unit ? ` ${p.unit}` : ""}` : "—"}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">Idéal: {p.min}–{p.max}{p.unit ? ` ${p.unit}` : ""}</p>
                        {st !== "ok" && st !== "none" && (
                          <p className="text-[10px] text-gray-500 mt-1">{p.desc}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {test.notes && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{test.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
