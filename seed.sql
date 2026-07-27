-- Начальные данные платформы (без паролей — админ создаётся через /api/setup)

INSERT OR REPLACE INTO settings (id, platform_name, default_quiz_pass, archive_days, default_lang, cert_valid_months)
VALUES (1, 'Kursused', 60, 30, 'et', 24);

INSERT OR REPLACE INTO email_templates (type, subject, body) VALUES
 ('cred',  'Ligipääs platvormile — {platform}', 'Tere, {student}!' || char(10) || 'Sinu kasutajanimi: {login}' || char(10) || 'Parool: {password}' || char(10) || 'Palun muuda parool esimesel sisenemisel.'),
 ('hw',    'Uus kodutöö · {course}', '{student}, kursusele «{course}» lisati ülesanne «{task}». Tähtaeg: {deadline}.'),
 ('grade', 'Töö hinnatud · {course}', '{student}, sinu töö «{task}» on hinnatud: {grade}.'),
 ('meet',  'Veebikohtumine · {course}', '{student}, rühmale {group} on määratud kohtumine: {datetime}. {link}'),
 ('invoice', 'Arve {number} — {seller}', 'Tere!' || char(10) || 'Lisatud on arve {number} summas {gross} (koos käibemaksuga).' || char(10) || 'Maksetähtaeg: {due}.' || char(10) || 'Palume tasuda arvel toodud arvelduskontole.' || char(10) || char(10) || 'Lugupidamisega,' || char(10) || '{seller}');

INSERT OR IGNORE INTO groups (id, name) VALUES
 ('g1', 'IT-2024'),
 ('g2', 'Disain-2024'),
 ('g3', 'Data-2025');
