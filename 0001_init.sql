-- ============================================================
--  Õppeplatvorm · Cloudflare D1 schema (SQLite)
--  Хранит ВСЁ: настройки, сотрудники, студенты, группы, курсы и
--  их содержимое (модули, уроки, тесты, материалы), домашние
--  задания, сдачи и оценки, прогресс, тесты, встречи, посещаемость,
--  сообщения, уведомления, заявки, сертификаты, аудит, очередь писем.
--  Бинарные файлы (материалы, логотипы, картинки, PDF-дипломы)
--  хранятся в R2, здесь — только ключи объектов (*_key).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Настройки (одна строка) ----------
CREATE TABLE IF NOT EXISTS settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  platform_name     TEXT    NOT NULL DEFAULT 'Kursused',
  default_quiz_pass INTEGER NOT NULL DEFAULT 60,
  archive_days      INTEGER NOT NULL DEFAULT 30,
  default_lang      TEXT    NOT NULL DEFAULT 'et',
  cert_valid_months INTEGER NOT NULL DEFAULT 24,
  -- реквизиты продавца и параметры счетов (Arved)
  invoice_seq          INTEGER NOT NULL DEFAULT 0,   -- последний использованный номер ESM#####
  invoice_default_price REAL   NOT NULL DEFAULT 65,  -- цена по умолчанию за участника
  invoice_due_days     INTEGER NOT NULL DEFAULT 14,  -- срок оплаты по умолчанию
  invoice_vat_rate     REAL    NOT NULL DEFAULT 24,  -- ставка НДС по умолчанию (0/22/24)
  invoice_price_incl_vat INTEGER NOT NULL DEFAULT 0, -- по умолчанию цены с НДС (1) или без (0)
  seller_name       TEXT    DEFAULT 'EDU KOOLITUS OÜ',
  seller_regcode    TEXT    DEFAULT '17217212',
  seller_vatno      TEXT    DEFAULT '',
  seller_address    TEXT    DEFAULT 'Tallinn, Eesti',
  seller_iban       TEXT    DEFAULT '',
  seller_bank       TEXT    DEFAULT '',
  seller_email      TEXT    DEFAULT '',
  seller_phone      TEXT    DEFAULT '',
  verify_base_url   TEXT    DEFAULT '',           -- публичный адрес страницы проверки сертификата (для QR)
  email_from        TEXT    DEFAULT '',           -- адрес отправителя (напр. arved@edukoolitus.ee)
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Шаблоны писем (по типу) ----------
CREATE TABLE IF NOT EXISTS email_templates (
  type    TEXT PRIMARY KEY,            -- cred | hw | grade | meet
  subject TEXT NOT NULL DEFAULT '',
  body    TEXT NOT NULL DEFAULT ''
);

-- ---------- Группы ----------
CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Сотрудники (админ / учитель) ----------
CREATE TABLE IF NOT EXISTS staff (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,         -- PBKDF2 (соль:итерации:hash)
  role          TEXT NOT NULL DEFAULT 'teacher',  -- admin | teacher
  perms         TEXT NOT NULL DEFAULT '{}',       -- JSON карта прав
  scope_all     INTEGER NOT NULL DEFAULT 1,       -- 1 = все группы
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Область доступа учителя по группам (когда scope_all = 0)
CREATE TABLE IF NOT EXISTS staff_groups (
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, group_id)
);

-- ---------- Студенты ----------
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  isikukood     TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  group_id      TEXT REFERENCES groups(id) ON DELETE SET NULL,
  last_active   TEXT,
  completed_at  TEXT,
  archive_at    TEXT,
  archived      INTEGER NOT NULL DEFAULT 0,        -- ручная архивация (без сертификата)
  archived_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | archived | closed
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_students_isikukood ON students(isikukood);

-- ---------- Курсы ----------
CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '📚',
  color       TEXT NOT NULL DEFAULT '#4f46e5',
  category    TEXT NOT NULL DEFAULT '',
  level       TEXT NOT NULL DEFAULT '',
  published   INTEGER NOT NULL DEFAULT 0,
  open_enroll INTEGER NOT NULL DEFAULT 0,
  quiz_pass   INTEGER NOT NULL DEFAULT 60,
  description TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Настройки шаблона сертификата курса
CREATE TABLE IF NOT EXISTS course_cert (
  course_id    TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  header_title TEXT NOT NULL DEFAULT 'TUNNISTUS',
  org_name     TEXT NOT NULL DEFAULT '',
  logo_key     TEXT,                    -- R2 ключ логотипа
  intro_text   TEXT NOT NULL DEFAULT 'läbis edukalt koolituse:',
  place        TEXT NOT NULL DEFAULT '',
  period       TEXT NOT NULL DEFAULT '',
  volume       TEXT NOT NULL DEFAULT '',
  valid_months INTEGER,
  ehis_id      TEXT NOT NULL DEFAULT '',
  topics       TEXT NOT NULL DEFAULT '',
  legal_text   TEXT NOT NULL DEFAULT '',
  sign1_name   TEXT NOT NULL DEFAULT '',
  sign1_title  TEXT NOT NULL DEFAULT '',
  sign2_name   TEXT NOT NULL DEFAULT '',
  sign2_title  TEXT NOT NULL DEFAULT '',
  grades_sheet INTEGER NOT NULL DEFAULT 0
);

-- Зачисления студентов на курсы (M:N)
CREATE TABLE IF NOT EXISTS enrollments (
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id);

-- ---------- Содержимое курса ----------
CREATE TABLE IF NOT EXISTS modules (
  id        TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);

CREATE TABLE IF NOT EXISTS lessons (
  id        TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  type      TEXT NOT NULL DEFAULT 'text',   -- text | video | quiz
  title     TEXT NOT NULL DEFAULT '',
  minutes   INTEGER NOT NULL DEFAULT 5,
  content   TEXT NOT NULL DEFAULT '',        -- HTML для text/video
  video_url TEXT NOT NULL DEFAULT '',
  quiz_json TEXT,                            -- JSON конфиг теста (вопросы, варианты, картинки-ключи, draw, shuffle)
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);

-- Материалы урока (файлы/картинки -> R2)
CREATE TABLE IF NOT EXISTS materials (
  id        TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'file',    -- image | file
  r2_key    TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON materials(lesson_id);

-- Домашние задания
CREATE TABLE IF NOT EXISTS homework (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  deadline    TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_homework_course ON homework(course_id);

-- ---------- Прогресс и оценки ----------
CREATE TABLE IF NOT EXISTS progress (
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_sc ON progress(student_id, course_id);

CREATE TABLE IF NOT EXISTS quiz_scores (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  PRIMARY KEY (student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}',
  layout_json  TEXT NOT NULL DEFAULT '{}',
  taken_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, lesson_id)
);

-- Сдачи домашних заданий (grade: число ИЛИ 'ARV' / 'MA')
CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL DEFAULT '',
  file_key    TEXT,                     -- R2 ключ прикреплённого файла
  date        TEXT NOT NULL DEFAULT (date('now')),
  grade       TEXT,                     -- NULL = не проверено
  feedback    TEXT NOT NULL DEFAULT '',
  graded_by   TEXT,
  graded_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_sub_hw ON submissions(homework_id);

-- ---------- Встречи и посещаемость ----------
CREATE TABLE IF NOT EXISTS meetings (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  format      TEXT NOT NULL DEFAULT 'online',   -- online | offline
  link        TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,
  time        TEXT NOT NULL DEFAULT '18:00',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meetings_group ON meetings(group_id);

CREATE TABLE IF NOT EXISTS attendance (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  present    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, student_id)
);

-- ---------- Сертификаты ----------
CREATE TABLE IF NOT EXISTS certificates (
  id          TEXT PRIMARY KEY,
  number      INTEGER NOT NULL,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  date        TEXT NOT NULL DEFAULT (date('now')),
  valid_until TEXT,
  pdf_key     TEXT,                      -- R2 ключ сохранённого PDF-диплома
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cert_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_cert_number ON certificates(number);

-- ---------- Счета (Arved) ----------
-- Один счёт выставляется на группу или на отдельного участника.
-- Номер счёта — ESM##### (см. settings.invoice_seq для последовательности).
CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  number      INTEGER NOT NULL,            -- порядковый номер (1,2,3…)
  number_str  TEXT NOT NULL,               -- форматированный: ESM00001
  viitenumber TEXT,                        -- эстонский банковский реф-номер (7-3-1)
  kind        TEXT NOT NULL DEFAULT 'invoice', -- invoice | credit (kreeditarve)
  credit_of   TEXT REFERENCES invoices(id) ON DELETE SET NULL, -- для кредит-счёта: ссылка на оригинал
  credited_by TEXT,                        -- для оригинала: id кредит-счёта
  mode        TEXT NOT NULL DEFAULT 'group', -- group | individual
  group_id    TEXT REFERENCES groups(id) ON DELETE SET NULL,
  course_id   TEXT REFERENCES courses(id) ON DELETE SET NULL,
  -- реквизиты плательщика (подтягиваются из бизнес-регистра Эстонии)
  buyer_name    TEXT,
  buyer_regcode TEXT,
  buyer_vatno   TEXT,
  buyer_address TEXT,
  buyer_email   TEXT,
  vat_rate    REAL NOT NULL DEFAULT 24,    -- käibemaks: 0 / 22 / 24
  price_includes_vat INTEGER NOT NULL DEFAULT 0, -- цены строк указаны с НДС (1) или без (0)
  note        TEXT,
  date        TEXT NOT NULL DEFAULT (date('now')),
  due_date    TEXT,
  paid        INTEGER NOT NULL DEFAULT 0,  -- ручная отметка оплаты
  paid_date   TEXT,
  pdf_key     TEXT,                        -- R2 ключ сохранённого PDF-счёта
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(number);
CREATE INDEX IF NOT EXISTS idx_invoices_group ON invoices(group_id);
CREATE INDEX IF NOT EXISTS idx_invoices_paid ON invoices(paid);

-- Участники счёта (имена всех участников идут на счёт)
CREATE TABLE IF NOT EXISTS invoice_participants (
  id         TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,                -- снимок имени на момент выставления
  isikukood  TEXT
);
CREATE INDEX IF NOT EXISTS idx_invpart_invoice ON invoice_participants(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invpart_student ON invoice_participants(student_id);

-- Строки счёта (услуга, количество, цена без НДС)
CREATE TABLE IF NOT EXISTS invoice_items (
  id         TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  descr      TEXT NOT NULL,
  qty        REAL NOT NULL DEFAULT 1,
  price      REAL NOT NULL DEFAULT 0,      -- цена за единицу без НДС
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invitem_invoice ON invoice_items(invoice_id);

-- ---------- Заявки на регистрацию ----------
CREATE TABLE IF NOT EXISTS requests (
  id         TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  isikukood  TEXT NOT NULL,
  email      TEXT NOT NULL,
  group_id   TEXT REFERENCES groups(id) ON DELETE SET NULL,
  date       TEXT NOT NULL DEFAULT (date('now'))
);

-- ---------- Чат студент ↔ админ ----------
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL,             -- student | admin
  text       TEXT NOT NULL,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_msg_student ON messages(student_id);

-- ---------- Внутренние уведомления (колокольчик) ----------
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  link       TEXT,
  ts         TEXT NOT NULL DEFAULT (datetime('now')),
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_student ON notifications(student_id);

-- ---------- Очередь писем (пока почта не подключена) ----------
CREATE TABLE IF NOT EXISTS outbox (
  id       TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject  TEXT NOT NULL,
  body     TEXT NOT NULL,
  type     TEXT NOT NULL DEFAULT 'info',
  ts       TEXT NOT NULL DEFAULT (datetime('now')),
  sent     INTEGER NOT NULL DEFAULT 0,       -- 0=в очереди, 1=отправлено
  status   TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | error
  error    TEXT,                             -- текст ошибки при неудаче
  sent_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);

-- ---------- Журнал действий (audit log) ----------
CREATE TABLE IF NOT EXISTS audit (
  id     TEXT PRIMARY KEY,
  ts     TEXT NOT NULL DEFAULT (datetime('now')),
  who    TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);

-- ---------- Сессии (для входа по токену) ----------
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,             -- id студента или сотрудника
  role       TEXT NOT NULL,             -- admin | teacher | student
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
