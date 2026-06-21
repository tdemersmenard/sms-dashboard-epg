-- Add slug column to franchises
ALTER TABLE franchises ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Set slugs for existing franchises
UPDATE franchises SET slug = 'granby' WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE franchises SET slug = 'trois-rivieres' WHERE id = '88e54929-cd03-4609-a0f3-c9a361788874';

-- Make slug NOT NULL after setting values
ALTER TABLE franchises ALTER COLUMN slug SET NOT NULL;
