/**
 * Marqueur « piscine fermée pour la saison » — vit dans contact.notes, comme
 * les autres marqueurs du système (RELANCE_PREVUE, APPEL_PREVU, TAG:*).
 *
 * Format: PISCINE_FERMÉE:YYYY-MM-DD
 * Le marqueur est saisonnier: il ne supprime les rappels de passage que pour
 * l'année où il a été posé — au printemps suivant, les rappels reprennent
 * sans qu'on ait à nettoyer les fiches.
 */

export const POOL_CLOSED_RE = /PISCINE_FERMÉE:(\d{4})-\d{2}-\d{2}/;

export function currentYearMtl(): number {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" }).slice(0, 4));
}

export function todayMtl(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });
}

/** Piscine fermée CETTE saison? (marqueur présent et posé cette année) */
export function isPoolClosed(notes: string | null | undefined): boolean {
  const m = (notes || "").match(POOL_CLOSED_RE);
  return !!m && Number(m[1]) === currentYearMtl();
}

export function poolClosedLine(date?: string): string {
  return `PISCINE_FERMÉE:${date || todayMtl()}`;
}

/** Ajoute le marqueur (idempotent pour la saison courante). */
export function addPoolClosedMarker(notes: string | null | undefined, date?: string): string {
  if (isPoolClosed(notes)) return (notes || "").trim();
  const cleaned = removePoolClosedMarker(notes);
  return [cleaned, poolClosedLine(date)].filter(Boolean).join("\n");
}

/** Retire tout marqueur PISCINE_FERMÉE (toutes années). */
export function removePoolClosedMarker(notes: string | null | undefined): string {
  return (notes || "")
    .split("\n")
    .filter((l) => !POOL_CLOSED_RE.test(l))
    .join("\n")
    .trim();
}
