import { supabaseAdmin } from "@/lib/supabase";

/**
 * PROGRAMME VOISIN — utilitaires: code référent, détection de voisinage.
 */

// Caractères non ambigus (pas de O/0, I/1/L)
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // sans I, L, O
const DIGITS = "23456789"; // sans 0, 1

const rand = (set: string) => set[Math.floor((globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Math.random() * 1e9) % set.length)];

/** Code court prononçable au téléphone: 3 lettres + 3 chiffres (ex. TDM472).
 *  Les lettres reprennent les initiales du client si elles sont non ambiguës. */
export function makeCode(seed?: string): string {
  // Initiale de chaque MOT (non ambiguë), complétée au hasard
  const initials = (seed || "").toUpperCase().split(/\s+/).map((w) => w.replace(/[^A-Z]/g, "")[0]).filter((ch) => ch && LETTERS.includes(ch)) as string[];
  let letters = "";
  for (let i = 0; i < 3; i++) letters += initials[i] ?? rand(LETTERS);
  let digits = "";
  for (let i = 0; i < 3; i++) digits += rand(DIGITS);
  return letters + digits;
}

/** Génère un code UNIQUE pour un client (réessaie si collision). */
export async function generateUniqueCode(seed?: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = makeCode(i === 0 ? seed : undefined);
    const { data } = await supabaseAdmin.from("contacts").select("id").eq("referral_code", code).maybeSingle();
    if (!data) return code;
  }
  // fallback quasi-impossible: suffixe aléatoire
  return makeCode() + Math.floor(Math.random() * 9);
}

/** Assure qu'un contact a un code (le crée si absent). Retourne le code. */
export async function ensureReferralCode(contactId: string): Promise<string | null> {
  const { data: c } = await supabaseAdmin.from("contacts").select("referral_code, first_name, last_name").eq("id", contactId).maybeSingle();
  if (!c) return null;
  if (c.referral_code) return c.referral_code;
  const seed = `${c.first_name ?? ""} ${c.last_name ?? ""}`;
  const code = await generateUniqueCode(seed);
  await supabaseAdmin.from("contacts").update({ referral_code: code }).eq("id", contactId);
  return code;
}

// ── Détection de voisinage ──────────────────────────────────────────────────

const strip = (s: string) => (s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Nom de rue normalisé (sans numéro civique ni type de voie générique). */
export function normalizeStreet(address: string): string {
  let s = strip(address);
  s = s.replace(/^\d+[a-z]?\s*/, ""); // numéro civique en tête
  s = s.replace(/\b(app|apt|unite|unit|suite|bureau)\s*\d+\b/g, ""); // appartement
  s = s.replace(/\b(rue|avenue|av|boulevard|boul|blvd|chemin|ch|montee|rang|place|pl|croissant|impasse|allee|cote|de|du|des|la|le|les|l)\b/g, "");
  return s.replace(/\s+/g, " ").trim();
}

const R = 6371; // km
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocode(address: string, city: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !address) return null;
  try {
    const q = encodeURIComponent(`${address}, ${city}, QC, Canada`);
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=${key}`);
    const j = await res.json();
    const loc = j?.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

export type DistanceType = "meme_rue" | "moins_1km" | "hors_rue";

/**
 * Classe la distance entre le référent et le voisin référé.
 * meme_rue = même ville + même nom de rue. Sinon géocode best-effort < 1 km.
 * À défaut → hors_rue (crédit réduit 75$).
 */
export async function classifyDistance(
  referrer: { address?: string | null; city?: string | null },
  referred: { address?: string | null; city?: string | null },
): Promise<DistanceType> {
  const cityR = strip(referrer.city || "");
  const cityN = strip(referred.city || "");
  const streetR = normalizeStreet(referrer.address || "");
  const streetN = normalizeStreet(referred.address || "");

  if (cityR && cityR === cityN && streetR && streetR === streetN) return "meme_rue";

  // Best-effort < 1 km via géocodage (si la clé/API est active)
  const [gR, gN] = await Promise.all([
    geocode(referrer.address || "", referrer.city || ""),
    geocode(referred.address || "", referred.city || ""),
  ]);
  if (gR && gN && haversine(gR, gN) <= 1) return "moins_1km";

  return "hors_rue";
}

export const CREDIT_CENTS: Record<DistanceType, number> = {
  meme_rue: 15000,
  moins_1km: 15000,
  hors_rue: 7500,
};
