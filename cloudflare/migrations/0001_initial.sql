CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  bkms_id TEXT NOT NULL UNIQUE,
  center TEXT NOT NULL,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_coordinator INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL UNIQUE,
  template_text TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS sabha_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_date TEXT NOT NULL,
  sabha_time TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_week_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  custom_message TEXT,
  sent_at TEXT,
  confirmed_at TEXT,
  declined_at TEXT,
  decline_reason TEXT,
  follow_up_sent_at TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  needs_resend INTEGER NOT NULL DEFAULT 0,
  telegram_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (person_id) REFERENCES people(id),
  UNIQUE (sabha_week_id, role_id)
);

CREATE TABLE IF NOT EXISTS confirmation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  chat_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_chats (
  chat_id TEXT PRIMARY KEY,
  chat_type TEXT NOT NULL,
  title TEXT,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS link_tokens (
  token TEXT PRIMARY KEY,
  person_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO roles (id, name, active) VALUES
  (1, 'MC', 1),
  (2, 'Dhun', 1),
  (3, 'Prathna', 1),
  (4, 'Kirtan', 1),
  (5, 'Presentation 1', 1),
  (6, 'Presentation 2', 1);

INSERT OR IGNORE INTO message_templates (role_id, template_text) VALUES
  (1, 'Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please be ready and confirm below.'),
  (2, 'Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please prepare and confirm below.'),
  (3, 'Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please prepare and confirm below.'),
  (4, 'Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please prepare and confirm below.'),
  (5, 'Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please be ready with your slides/material and confirm below.'),
  (6, 'Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please be ready with your slides/material and confirm below.');
