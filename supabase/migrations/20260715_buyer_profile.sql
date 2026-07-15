-- ================================================================
-- Profil d'acheteur (buyer profile) — migration 2026-07-15
-- Détecté dynamiquement par l'IA (CHLORE) pour adapter le pitch.
-- Valeurs: 'presse' | 'prix' | 'analytique' | 'indecis' | 'relationnel' | NULL
-- Scopé par franchise via la ligne contacts (franchise_id existant).
-- Le profil n'affecte JAMAIS les prix — seulement le discours.
-- ================================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS buyer_profile TEXT;
