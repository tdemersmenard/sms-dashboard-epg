-- ================================================================
-- Dépenses Business — migration 2026-04-12
-- ================================================================

CREATE TABLE depenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date DATE NOT NULL,
  description TEXT NOT NULL,
  montant DECIMAL(10,2) NOT NULL,
  categorie TEXT NOT NULL CHECK (categorie IN (
    'vehicule', 'equipement', 'logiciels', 'repas',
    'telephone', 'materiel', 'formation', 'autre'
  )),
  recu_url TEXT,
  recu_nom TEXT,
  note TEXT,
  annee INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
);

-- RLS : app mono-utilisateur, accès libre (dashboard sans auth Supabase)
ALTER TABLE depenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_depenses" ON depenses
  FOR ALL USING (true);

-- ================================================================
-- Storage bucket "recus" — PUBLIC
-- Exécuter aussi dans le dashboard Supabase si les lignes suivantes
-- échouent (les policies storage nécessitent parfois l'UI Supabase).
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('recus', 'recus', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_all_recus_objects" ON storage.objects
  FOR ALL USING (bucket_id = 'recus');
