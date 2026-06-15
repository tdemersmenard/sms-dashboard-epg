export interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  defaultPrice: number;
  category: string;
}

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "ouverture",
    name: "Ouverture seule",
    description: "Nettoyage 30 min + branchement tuyaux + trousse d'ouverture incluse",
    defaultPrice: 249,
    category: "Saisonnier",
  },
  {
    id: "fermeture",
    name: "Fermeture seule",
    description: "Fermeture et hivernisation de la piscine",
    defaultPrice: 199,
    category: "Saisonnier",
  },
  {
    id: "package_ouv_ferm",
    name: "Package ouverture + fermeture",
    description: "Ouverture au printemps + fermeture à l'automne — meilleur deal!",
    defaultPrice: 450,
    category: "Saisonnier",
  },
  {
    id: "entretien_hebdo",
    name: "Entretien hebdomadaire",
    description: "Visite chaque semaine — ouverture + fermeture + produits de balancement inclus",
    defaultPrice: 1799,
    category: "Entretien",
  },
  {
    id: "entretien_2sem",
    name: "Entretien aux 2 semaines",
    description: "Visite aux 2 semaines — ouverture + fermeture + produits de balancement inclus",
    defaultPrice: 1397,
    category: "Entretien",
  },
  {
    id: "spa",
    name: "Spa (add-on entretien)",
    description: "Service d'entretien du spa en supplément de la piscine",
    defaultPrice: 500,
    category: "Entretien",
  },
  {
    id: "remise_neuf",
    name: "Remise à neuf plomberie hors-terre",
    description: "Remplacement de la plomberie et des accessoires",
    defaultPrice: 300,
    category: "Réparation",
  },
  {
    id: "deplacement",
    name: "Déplacement + 30 min",
    description: "Appel de service — déplacement et 30 premières minutes incluses",
    defaultPrice: 80,
    category: "Service",
  },
  {
    id: "heure_supp",
    name: "Heure de travail supplémentaire",
    description: "Après les 30 premières minutes incluses dans le déplacement",
    defaultPrice: 85,
    category: "Service",
  },
  {
    id: "trousse",
    name: "Trousse d'ouverture",
    description: "Produits chimiques pour l'ouverture de piscine",
    defaultPrice: 20,
    category: "Produit",
  },
];

export const CATALOG_CATEGORIES = Array.from(new Set(CATALOG_ITEMS.map(i => i.category)));
