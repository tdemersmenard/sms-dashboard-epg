-- Table saison_clients — données de facturation par saison
CREATE TABLE IF NOT EXISTS saison_clients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  name        text        NOT NULL,
  address     text        NOT NULL DEFAULT '',
  service     text        NOT NULL DEFAULT '',
  total       numeric     NOT NULL DEFAULT 0,
  paid        numeric     NOT NULL DEFAULT 0,
  notes       text
);

-- Seed initial (18 clients saison 2025)
-- Si la table est déjà peuplée, ne rien faire
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM saison_clients LIMIT 1) THEN
    INSERT INTO saison_clients (name, address, service, total, paid) VALUES
      ('François Tétreault',    '24 des Rossignols, Granby',         'Entretien',                     2100, 1050),
      ('Karine Gince',          '',                                   'Ouverture',                      170,    0),
      ('Vicky',                 '26 Robinson, Waterloo',              'Ouverture',                      175,  175),
      ('Rox',                   '762 rue Beauport, Granby',           'Ouverture + Fermeture',          400,    0),
      ('Maxime',                '',                                   'Ouverture + Fermeture',          300,  300),
      ('Michael Bernard',       '497 Bégin, Granby',                 'Entretien spa',                 1800,  300),
      ('Mathieu Girard',        '',                                   'Entretien',                     2000,    0),
      ('Yan',                   '',                                   'Entretien',                     2700,    0),
      ('Olivier Tétreault',     '767 rue Terrebonne, Granby',        'Ouverture 2 passages',           300,  300),
      ('Christian Blais',       '146 des Cerisiers, Granby',         'Entretien',                     2000, 1000),
      ('Jacqueline Auger',      '515 ch Huntington, Bromont',        'Ouverture',                      200,  200),
      ('Samuel Dupont',         '38 rue Church, Granby',             'Entretien aux 2 sem.',          1200,  600),
      ('Marc-André Lapointe',   '677 Gilles-Cadorette, Granby',     'Entretien',                     2000, 1000),
      ('Caleb Gaumond',         '443 Vimont, Granby',                'Entretien',                     1500,    0),
      ('Julien Larouche',       '58 Impasse de l''Île, Roxton Pond', 'Entretien',                     1800,  900),
      ('Benoit Jalbert',        '56 Saint-Urbain, Granby',           'Ouverture 2 passages',           300,    0),
      ('Jean-François Ostiguy', '285 ch de l''Ange-Gardien, St-Paul','Entretien',                     2000,    0),
      ('Philippe Dufour',       '',                                   'Ouvert./Fermet. + 2 passages',   650,  325);
  END IF;
END $$;

-- Activer Realtime (optionnel)
ALTER PUBLICATION supabase_realtime ADD TABLE saison_clients;
