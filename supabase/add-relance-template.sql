INSERT INTO message_templates (name, body, category, variables) VALUES
('Relance nouveau lead', 'Bonjour {{prénom}}, c''est Thomas d''Entretien Piscine Granby! Je fais un petit suivi, avez-vous eu le temps de réfléchir pour l''entretien de votre piscine? On a encore quelques places pour cet été. N''hésitez pas à me répondre ou à m''appeler au 450-994-2215!', 'relance', '["{{prénom}}"]')
ON CONFLICT DO NOTHING;
