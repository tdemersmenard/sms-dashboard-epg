-- =============================================
-- PHASE 1 — Multi-tenant foundations
-- Run this in Supabase SQL Editor
-- Safe to re-run (idempotent)
-- =============================================

-- ─── 1. TABLE FRANCHISES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS franchises (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name                      TEXT        NOT NULL,
  owner_name                TEXT,
  owner_email               TEXT,
  owner_phone               TEXT,
  business_address          TEXT,
  territory                 TEXT,                             -- zone géographique exclusive
  status                    TEXT        DEFAULT 'pending',    -- pending | active | suspended
  -- Twilio (auth_token chiffré AES-256-GCM via ENCRYPTION_KEY)
  twilio_account_sid        TEXT,
  twilio_auth_token_encrypted TEXT,
  twilio_phone_number       TEXT,
  -- Facturation
  franchise_fee_paid        BOOLEAN     DEFAULT false,
  royalty_percent           NUMERIC     DEFAULT 8,
  monthly_fee               NUMERIC     DEFAULT 200,
  -- Infos entreprise pour factures / bot
  email                     TEXT,
  payment_interac_email     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. FRANCHISE GRANBY (la première franchise) ─────────────────────────────
-- UUID fixe pour référencer dans le code (GRANBY_FRANCHISE_ID)
INSERT INTO franchises (
  id, name, owner_name, owner_email, status,
  franchise_fee_paid, royalty_percent, monthly_fee
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Entretien Piscine Granby',
  'Thomas Demers-Ménard',
  'thomas@chlore.ca',
  'active',
  true, 8, 0   -- Thomas ne se paie pas de redevances à lui-même
) ON CONFLICT (id) DO UPDATE SET status = 'active';

-- ─── 3. COLONNE franchise_id SUR admin_users ─────────────────────────────────
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id),
  ADD COLUMN IF NOT EXISTS is_master    BOOLEAN DEFAULT false;

-- Thomas est super-admin master
UPDATE admin_users
SET franchise_id = '00000000-0000-0000-0000-000000000001',
    is_master    = true
WHERE franchise_id IS NULL;

-- ─── 4. COLONNE franchise_id SUR TOUTES LES TABLES DE DONNÉES ───────────────

ALTER TABLE contacts         ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE messages         ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE jobs             ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE payments         ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE documents        ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE employees        ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE settings         ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE automation_logs  ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
ALTER TABLE route_state      ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);

-- Tables optionnelles (exécuter seulement si elles existent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'catalog_items') THEN
    ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'water_tests') THEN
    ALTER TABLE water_tests ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    ALTER TABLE depenses ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learnings') THEN
    ALTER TABLE learnings ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id);
  END IF;
END $$;

-- ─── 5. MIGRATION DES DONNÉES EXISTANTES → GRANBY ───────────────────────────

UPDATE contacts        SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE messages        SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE jobs            SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE payments        SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE documents       SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE employees       SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE settings        SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE automation_logs SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
UPDATE route_state     SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'catalog_items') THEN
    UPDATE catalog_items SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'water_tests') THEN
    UPDATE water_tests SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    UPDATE depenses SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learnings') THEN
    UPDATE learnings SET franchise_id = '00000000-0000-0000-0000-000000000001' WHERE franchise_id IS NULL;
  END IF;
END $$;

-- ─── 6. CONTRAINTE UNIQUE SUR contacts.phone ────────────────────────────────
-- Un même numéro peut être client de PLUSIEURS franchises
-- Remplacer UNIQUE(phone) par UNIQUE(phone, franchise_id)

DO $$
BEGIN
  -- Supprimer l'ancienne contrainte unique sur phone seul
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contacts' AND constraint_name = 'contacts_phone_key'
  ) THEN
    ALTER TABLE contacts DROP CONSTRAINT contacts_phone_key;
  END IF;
END $$;

-- Ajouter la contrainte composite (phone + franchise)
ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_phone_franchise_key;
ALTER TABLE contacts
  ADD CONSTRAINT contacts_phone_franchise_key UNIQUE (phone, franchise_id);

-- ─── 7. INDEX DE PERFORMANCE ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_franchise_id    ON contacts(franchise_id);
CREATE INDEX IF NOT EXISTS idx_messages_franchise_id    ON messages(franchise_id);
CREATE INDEX IF NOT EXISTS idx_jobs_franchise_id        ON jobs(franchise_id);
CREATE INDEX IF NOT EXISTS idx_payments_franchise_id    ON payments(franchise_id);
CREATE INDEX IF NOT EXISTS idx_employees_franchise_id   ON employees(franchise_id);
CREATE INDEX IF NOT EXISTS idx_franchises_phone         ON franchises(twilio_phone_number);

-- ─── 8. RLS — PRÉPARATION ───────────────────────────────────────────────────
-- Note: comme tout le code utilise service_role (supabaseAdmin),
-- le RLS ne bloque pas les accès serveur.
-- L'isolation entre franchises est garantie au niveau du code API
-- (chaque requête filtre par franchise_id).
--
-- Pour un RLS complet (avec Supabase Auth JWT + claims franchise_id),
-- ajouter les politiques suivantes après avoir migré vers Supabase Auth:
--
-- ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "franchise_isolation" ON contacts
--   USING (franchise_id = (auth.jwt() ->> 'franchise_id')::uuid
--          OR (auth.jwt() ->> 'is_master')::boolean = true);
--
-- (Répéter pour chaque table)
--
-- Pour l'instant: RLS déjà activé sur contacts et messages (service role bypass).

-- ─── VÉRIFICATION ───────────────────────────────────────────────────────────
SELECT
  'franchises' AS table_name,
  COUNT(*) AS row_count
FROM franchises
UNION ALL
SELECT 'contacts (avec franchise_id)', COUNT(*) FROM contacts WHERE franchise_id IS NOT NULL
UNION ALL
SELECT 'jobs (avec franchise_id)', COUNT(*) FROM jobs WHERE franchise_id IS NOT NULL
UNION ALL
SELECT 'messages (avec franchise_id)', COUNT(*) FROM messages WHERE franchise_id IS NOT NULL;
