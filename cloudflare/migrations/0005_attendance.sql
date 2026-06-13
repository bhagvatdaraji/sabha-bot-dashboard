CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_week_id INTEGER NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  report_sent_at TEXT,
  report_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_week_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  checked_in_at TEXT,
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE (sabha_week_id, person_id)
);
