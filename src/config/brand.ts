/**
 * BRAND — source unique de vérité pour l'identité commerciale.
 *
 * Tout le branding (nom, tagline, couleurs, logos, coordonnées) passe par ce
 * fichier: aucun nom de marque ne doit être hardcodé ailleurs. Un rebranding
 * futur — ou une franchise avec sa propre marque — se fait ici.
 *
 * Multi-marques: `getBrand(franchiseId)` retourne la marque de la franchise;
 * pour l'instant toutes retombent sur ALTAMAR, mais la structure permet
 * d'ajouter une entrée par territoire (ex: Trois-Rivières avec son identité).
 */

export interface Brand {
  /** Nom commercial affiché partout */
  name: string;
  /** Nom légal — si différent du nom commercial, les documents affichent
   *  "[legalName], faisant affaire sous [name]" en pied de page */
  legalName: string;
  tagline: string;
  colors: {
    navy: string;   // fond sombre / texte principal
    ocean: string;  // primaire
    cyan: string;   // accent
    cream: string;  // fonds clairs optionnels (documents)
    white: string;
  };
  logos: {
    /** Lettre "A" géométrique avec vague — déposer les fichiers dans /public/brand/ */
    mark: string;
    full: string;
    banner: string;
  };
  /** Téléphone business (affiché aux clients) */
  phone: string;
  phoneE164: string;
  /** Numéro du bot SMS (Twilio) */
  botPhoneE164: string;
  /** Adresse courriel de service — à changer ici quand le nouveau domaine sera actif */
  email: string;
  /** URL de l'app (fallback si NEXT_PUBLIC_APP_URL absent) — à changer ici au nouveau domaine */
  appUrl: string;
  address: string;
  city: string;
  /** NEQ / numéro d'entreprise (placeholder tant que non fourni) */
  neq: string;
}

export const BRAND: Brand = {
  name: "ALTAMAR",
  legalName: "ALTAMAR",
  tagline: "Entretien piscine et spa",
  colors: {
    navy: "#0a1628",
    ocean: "#0077b6",
    cyan: "#7dd3de",
    cream: "#f5f1e8",
    white: "#ffffff",
  },
  logos: {
    mark: "/brand/logo-mark.png",
    full: "/brand/logo-full.png",
    banner: "/brand/banner.png",
  },
  phone: "450-994-2215",
  phoneE164: "+14509942215",
  botPhoneE164: "+14509159650",
  email: "service@entretienpiscinegranby.com",
  appUrl: "https://altamar.ca",
  address: "86 rue de Windsor, Granby QC J2H 1V4",
  city: "Granby",
  neq: "",
};

/** URL de base effective (env d'abord, fallback marque) */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || BRAND.appUrl;
}

/** Ligne légale des documents — vide si le nom légal est le nom commercial */
export function legalFooterLine(): string {
  return BRAND.legalName && BRAND.legalName !== BRAND.name
    ? `${BRAND.legalName}, faisant affaire sous ${BRAND.name}`
    : "";
}

/** Marque par franchise — pour l'instant tout le monde est ALTAMAR.
 *  Ajouter ici une entrée par franchise qui aura sa propre identité. */
const FRANCHISE_BRANDS: Record<string, Partial<Brand>> = {};

export function getBrand(franchiseId?: string | null): Brand {
  if (franchiseId && FRANCHISE_BRANDS[franchiseId]) {
    return { ...BRAND, ...FRANCHISE_BRANDS[franchiseId] };
  }
  return BRAND;
}
