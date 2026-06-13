ALTER TABLE telegram_chats ADD COLUMN is_summary_target INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sabha_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_week_id INTEGER NOT NULL UNIQUE,
  message_text TEXT NOT NULL,
  sent_at TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  telegram_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sabha_summary_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_week_id INTEGER NOT NULL,
  message_text TEXT NOT NULL,
  telegram_message_id TEXT,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE
);
