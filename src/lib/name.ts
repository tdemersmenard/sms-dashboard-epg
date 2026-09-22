/**
 * Extraction du prénom — LE seul utilitaire à utiliser partout.
 *
 * Les leads Meta arrivent avec full_name ("Jonathan Tardif",
 * "patrick-emanuel roy", "MARIE-CLAUDE ST-PIERRE", "Éric côté"):
 * on garde le PREMIER mot seulement, avec la bonne capitalisation —
 * chaque segment d'un nom composé (trait d'union) est capitalisé,
 * accents préservés.
 */

/** "patrick-emanuel roy" → "Patrick-Emanuel" ; "ÉRIC Côté" → "Éric" */
export function firstNameFrom(fullName: string | null | undefined): string | null {
  const first = (fullName || "").trim().split(/\s+/)[0];
  if (!first) return null;
  return first
    .split("-")
    .map((seg) =>
      seg
        ? seg.charAt(0).toLocaleUpperCase("fr-CA") + seg.slice(1).toLocaleLowerCase("fr-CA")
        : seg,
    )
    .join("-");
}
