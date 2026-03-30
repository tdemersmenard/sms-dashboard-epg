-- =============================================
-- SMS Dashboard - Supabase Schema
-- Entretien Piscine Granby
-- =============================================

-- Contacts table (tes leads/clients)
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  twilio_sid TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  status TEXT DEFAULT 'delivered',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_messages_contact_id ON messages(contact_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_is_read ON messages(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_contacts_phone ON contacts(phone);

-- Function pour updated_at auto
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Vue pour les conversations (dernier message + unread count)
CREATE OR REPLACE VIEW conversations AS
SELECT
  c.id AS contact_id,
  c.phone,
  c.name,
  c.notes,
  m.body AS last_message,
  m.direction AS last_direction,
  m.created_at AS last_message_at,
  COALESCE(unread.count, 0) AS unread_count
FROM contacts c
LEFT JOIN LATERAL (
  SELECT body, direction, created_at
  FROM messages
  WHERE contact_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) m ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS count
  FROM messages
  WHERE contact_id = c.id
    AND direction = 'inbound'
    AND is_read = FALSE
) unread ON TRUE
WHERE m.created_at IS NOT NULL
ORDER BY m.created_at DESC;

-- RLS Policies (on garde ça simple - service role only)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access contacts"
  ON contacts FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role full access messages"
  ON messages FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
