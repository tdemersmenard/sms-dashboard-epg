import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────────────────────

export type CategorieDepense =
  | "vehicule" | "equipement" | "logiciels" | "repas"
  | "telephone" | "materiel" | "formation" | "autre";

export interface CatInfo {
  label: string;
  pct: number;
  color: string;
  tailwindBg: string;
  tailwindText: string;
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
}

// ── Constantes ─────────────────────────────────────────────────────────────

export const CATS: Record<CategorieDepense, CatInfo> = {
  vehicule:   { label: "Véhicule",          pct: 65,  color: "blue",   tailwindBg: "bg-blue-100",   tailwindText: "text-blue-700"   },
  equipement: { label: "Équipement / tech", pct: 80,  color: "amber",  tailwindBg: "bg-amber-100",  tailwindText: "text-amber-700"  },
  logiciels:  { label: "Logiciels / abo.",  pct: 100, color: "green",  tailwindBg: "bg-green-100",  tailwindText: "text-green-700"  },
  repas:      { label: "Repas clients",     pct: 50,  color: "red",    tailwindBg: "bg-red-100",    tailwindText: "text-red-700"    },
  telephone:  { label: "Téléphone",         pct: 70,  color: "purple", tailwindBg: "bg-purple-100", tailwindText: "text-purple-700" },
  materiel:   { label: "Matériel piscine",  pct: 100, color: "orange", tailwindBg: "bg-orange-100", tailwindText: "text-orange-700" },
  formation:  { label: "Formation",         pct: 100, color: "cyan",   tailwindBg: "bg-cyan-100",   tailwindText: "text-cyan-700"   },
  autre:      { label: "Autre",             pct: 100, color: "gray",   tailwindBg: "bg-gray-100",   tailwindText: "text-gray-700"   },
};

export const TAUX_MARGINAL = 0.38;

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Supabase ───────────────────────────────────────────────────────────────

export async function fetchDepenses(annee: number): Promise<Depense[]> {
  const { data, error } = await supabaseBrowser
    .from("depenses")
    .select("*")
    .eq("annee", annee)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as Depense[]) || [];
}

export async function deleteDepense(id: string, recuUrl: string | null): Promise<void> {
  if (recuUrl) {
    try {
      const url = new URL(recuUrl);
      const marker = "/storage/v1/object/public/recus/";
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const filePath = url.pathname.slice(idx + marker.length);
        await supabaseBrowser.storage.from("recus").remove([filePath]);
      }
    } catch {
      // Ignore storage errors silently
    }
  }
  const { error } = await supabaseBrowser.from("depenses").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadRecu(
  file: File,
  annee: number,
  depenseId: string
): Promise<{ url: string; nom: string }> {
  const ext = file.name.split(".").pop() || "bin";
  const timestamp = Date.now();
  const path = `${annee}/${depenseId}-${timestamp}.${ext}`;

  const { error } = await supabaseBrowser.storage
    .from("recus")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data: urlData } = supabaseBrowser.storage
    .from("recus")
    .getPublicUrl(path);

  return { url: urlData.publicUrl, nom: file.name };
}
