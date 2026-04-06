ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ouverture_date DATE;

UPDATE contacts c SET ouverture_date = (
  SELECT j.scheduled_date FROM jobs j
  WHERE j.contact_id = c.id AND j.job_type = 'ouverture'
  ORDER BY j.scheduled_date DESC LIMIT 1
) WHERE ouverture_date IS NULL;
