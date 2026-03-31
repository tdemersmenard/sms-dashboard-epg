-- ============================================================
-- CHLORE CRM — Migration Supabase
-- IMPORTANT: Ce script AJOUTE aux tables existantes, il ne les détruit pas
-- Exécuter dans Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- 1. ÉTENDRE LA TABLE CONTACTS EXISTANTE
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Granby';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pool_type TEXT CHECK (pool_type IN ('hors-terre', 'creusée'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pool_dimensions TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pool_system TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS has_spa BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'nouveau';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS season_price DECIMAL(10,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Migration: populate first_name/last_name depuis la colonne "name" existante
UPDATE contacts SET
  first_name = SPLIT_PART(COALESCE(name, 'Inconnu'), ' ', 1),
  last_name = CASE
    WHEN POSITION(' ' IN COALESCE(name, '')) > 0
    THEN SUBSTRING(COALESCE(name, '') FROM POSITION(' ' IN COALESCE(name, '')) + 1)
    ELSE ''
  END
WHERE first_name IS NULL;

-- ============================================================
-- 2. NOUVELLE TABLE: jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('ouverture', 'entretien', 'fermeture', 'visite', 'autre')),
  scheduled_date DATE NOT NULL,
  scheduled_time_start TIME,
  scheduled_time_end TIME,
  status TEXT DEFAULT 'planifié' CHECK (status IN ('planifié', 'confirmé', 'en_cours', 'complété', 'annulé')),
  notes TEXT,
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- 3. NOUVELLE TABLE: documents (soumissions, contrats, factures)
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('soumission', 'contrat', 'facture')),
  doc_number TEXT NOT NULL,
  amount DECIMAL(10,2),
  status TEXT DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'envoyé', 'signé', 'payé')),
  pdf_url TEXT,
  data JSONB
);

-- ============================================================
-- 4. NOUVELLE TABLE: message_templates
-- ============================================================

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT CHECK (category IN ('relance', 'confirmation', 'rappel_paiement', 'suivi', 'promo', 'autre')),
  variables JSONB DEFAULT '[]'
);

-- ============================================================
-- 5. NOUVELLE TABLE: payments
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id),
  amount DECIMAL(10,2) NOT NULL,
  method TEXT DEFAULT 'interac',
  status TEXT DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'reçu', 'en_retard')),
  due_date DATE,
  received_date DATE,
  notes TEXT
);

-- ============================================================
-- 6. NOUVELLE TABLE: automations
-- ============================================================

CREATE TABLE IF NOT EXISTS automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('stage_change', 'time_delay', 'payment_due', 'job_reminder')),
  trigger_config JSONB NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('send_sms', 'send_email', 'create_task')),
  action_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 7. NOUVELLE TABLE: automation_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  automation_id UUID REFERENCES automations(id),
  contact_id UUID REFERENCES contacts(id),
  action TEXT NOT NULL,
  status TEXT DEFAULT 'success',
  details JSONB
);

-- ============================================================
-- 8. NOUVELLE TABLE: call_transcripts
-- ============================================================

CREATE TABLE IF NOT EXISTS call_transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  contact_id UUID REFERENCES contacts(id),
  phone TEXT NOT NULL,
  duration_seconds INTEGER,
  transcript TEXT,
  ai_summary TEXT,
  extracted_data JSONB,
  audio_url TEXT
);

-- ============================================================
-- 9. INDEX DE PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage);
CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_contact ON jobs(contact_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- ============================================================
-- 10. REALTIME
-- Utilise DO $$ pour éviter l'erreur si la table est déjà membre
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
  END IF;
END $$;

-- ============================================================
-- 11. TRIGGER updated_at SUR CONTACTS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. FONCTION RPC: get_conversations()
-- Utilisée par /api/conversations pour remplacer la vue
-- ============================================================

CREATE OR REPLACE FUNCTION get_conversations()
RETURNS TABLE (
  contact_id UUID,
  phone TEXT,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  stage TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS contact_id,
    c.phone,
    c.name,
    c.first_name,
    c.last_name,
    c.stage,
    m.body AS last_message,
    m.created_at AS last_message_at,
    COALESCE(u.unread_count, 0) AS unread_count
  FROM contacts c
  INNER JOIN LATERAL (
    SELECT msg.body, msg.created_at
    FROM messages msg
    WHERE msg.contact_id = c.id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) m ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS unread_count
    FROM messages msg
    WHERE msg.contact_id = c.id
      AND msg.direction = 'inbound'
      AND msg.is_read = FALSE
  ) u ON TRUE
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 13. SEED: templates de messages par défaut
-- ============================================================

INSERT INTO message_templates (name, body, category, variables) VALUES
(
  'Confirmation RDV',
  'Bonjour {{prénom}}, c''est Thomas d''Entretien Piscine Granby. Je confirme notre rendez-vous le {{date}} entre {{heure_début}} et {{heure_fin}} à votre domicile. À bientôt!',
  'confirmation',
  '["{{prénom}}", "{{date}}", "{{heure_début}}", "{{heure_fin}}"]'
),
(
  'Rappel RDV veille',
  'Bonjour {{prénom}}! Petit rappel que je passe chez vous demain pour {{service}}. Si vous avez des questions, n''hésitez pas. Bonne soirée!',
  'confirmation',
  '["{{prénom}}", "{{service}}"]'
),
(
  'En route',
  'Bonjour {{prénom}}, je suis en route vers chez vous. J''arrive dans environ {{minutes}} minutes!',
  'confirmation',
  '["{{prénom}}", "{{minutes}}"]'
),
(
  'Job complété',
  'Bonjour {{prénom}}, l''entretien de votre piscine est complété! Tout est beau. Si vous avez des questions, n''hésitez pas. Bonne baignade!',
  'suivi',
  '["{{prénom}}"]'
),
(
  'Relance soumission',
  'Bonjour {{prénom}}, c''est Thomas d''Entretien Piscine Granby. Je fais un suivi concernant la soumission que je vous ai envoyée. Avez-vous eu le temps d''y jeter un coup d''oeil? Les places pour la saison 2026 partent vite!',
  'relance',
  '["{{prénom}}"]'
),
(
  'Rappel paiement',
  'Bonjour {{prénom}}, un petit rappel amical que votre paiement de {{montant}}$ est dû pour le {{date}}. Vous pouvez faire le virement Interac à service@entretienpiscinegranby.com. Merci!',
  'rappel_paiement',
  '["{{prénom}}", "{{montant}}", "{{date}}"]'
),
(
  'Demande avis Google',
  'Bonjour {{prénom}}! J''espère que vous profitez bien de votre piscine. Si vous êtes satisfait de nos services, un petit avis Google nous aiderait énormément. Merci beaucoup!',
  'suivi',
  '["{{prénom}}"]'
),
(
  'Premier contact',
  'Bonjour {{prénom}}, c''est Thomas d''Entretien Piscine Granby! J''ai bien reçu votre demande. Je serais disponible pour discuter de vos besoins d''entretien de piscine. Quel moment vous conviendrait?',
  'relance',
  '["{{prénom}}"]'
)
ON CONFLICT DO NOTHING;
