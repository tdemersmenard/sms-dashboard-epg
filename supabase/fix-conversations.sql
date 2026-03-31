-- Drop old version if exists
DROP FUNCTION IF EXISTS get_conversations_v2();

CREATE OR REPLACE FUNCTION get_conversations_v2()
RETURNS TABLE (
  contact_id UUID,
  phone TEXT,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  stage TEXT,
  notes TEXT,
  last_message TEXT,
  last_direction TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH last_msgs AS (
    SELECT DISTINCT ON (m.contact_id)
      m.contact_id,
      m.body,
      m.direction,
      m.created_at
    FROM messages m
    ORDER BY m.contact_id, m.created_at DESC
  ),
  unread_counts AS (
    SELECT
      m.contact_id,
      COUNT(*) AS cnt
    FROM messages m
    WHERE m.direction = 'inbound' AND m.is_read = FALSE
    GROUP BY m.contact_id
  )
  SELECT
    c.id AS contact_id,
    c.phone,
    c.name,
    c.first_name,
    c.last_name,
    c.stage,
    c.notes,
    lm.body AS last_message,
    lm.direction AS last_direction,
    lm.created_at AS last_message_at,
    COALESCE(uc.cnt, 0) AS unread_count
  FROM contacts c
  INNER JOIN last_msgs lm ON lm.contact_id = c.id
  LEFT JOIN unread_counts uc ON uc.contact_id = c.id
  ORDER BY lm.created_at DESC;
END;
$$ LANGUAGE plpgsql;
