// ================================================================
// Dépenses — constantes et types partagés (pas d'import Supabase)
// Importable depuis les API routes (server) ET les composants (client)
// ================================================================

export type CategorieDepense =
  | "vehicule" | "equipement" | "logiciels" | "repas"
  | "telephone" | "materiel" | "formation" | "autre";

export interface CatInfo {
  label: string;
  pct: number;
  color: string;
  tailwindBg: string;
  tailwindText: string;
  pdfColor: string;
}

export interface Depense {
  id: string;
  created_at: string;
  date: string;
  description: string;
  montant: number;
  categorie: CategorieDepense;
  recu_url: string | null;
  recu_nom: string | null;
  note: string | null;
  annee: number;
  source: string | null;
}

export const CATS: Record<CategorieDepense, CatInfo> = {
  vehicule:   { label: "Véhicule",          pct: 70,  color: "blue",   tailwindBg: "bg-blue-100",   tailwindText: "text-blue-700",   pdfColor: "#1d4ed8" },
  equipement: { label: "Équipement / tech", pct: 80,  color: "amber",  tailwindBg: "bg-amber-100",  tailwindText: "text-amber-700",  pdfColor: "#b45309" },
  logiciels:  { label: "Logiciels / abo.",  pct: 100, color: "green",  tailwindBg: "bg-green-100",  tailwindText: "text-green-700",  pdfColor: "#15803d" },
  repas:      { label: "Repas clients",     pct: 50,  color: "red",    tailwindBg: "bg-red-100",    tailwindText: "text-red-700",    pdfColor: "#b91c1c" },
  telephone:  { label: "Téléphone",         pct: 70,  color: "purple", tailwindBg: "bg-purple-100", tailwindText: "text-purple-700", pdfColor: "#7c3aed" },
  materiel:   { label: "Matériel piscine",  pct: 100, color: "orange", tailwindBg: "bg-orange-100", tailwindText: "text-orange-700", pdfColor: "#c2410c" },
  formation:  { label: "Formation",         pct: 100, color: "cyan",   tailwindBg: "bg-cyan-100",   tailwindText: "text-cyan-700",   pdfColor: "#0e7490" },
  autre:      { label: "Autre",             pct: 100, color: "gray",   tailwindBg: "bg-gray-100",   tailwindText: "text-gray-700",   pdfColor: "#4b5563" },
};

export const TAUX_MARGINAL = 0.38;

export const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function fmt(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function montantDeductible(montant: number, pct: number): number {
  return (montant * pct) / 100;
}
