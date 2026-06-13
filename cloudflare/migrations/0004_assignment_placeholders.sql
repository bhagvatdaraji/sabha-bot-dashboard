PRAGMA foreign_keys=off;

CREATE TABLE assignments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sabha_week_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  person_id INTEGER,
  placeholder_name TEXT,
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

INSERT INTO assignments_new (
  id,
  sabha_week_id,
  role_id,
  person_id,
  placeholder_name,
  custom_message,
  sent_at,
  confirmed_at,
  declined_at,
  decline_reason,
  follow_up_sent_at,
  send_count,
  needs_resend,
  telegram_message_id,
  created_at,
  updated_at
)
SELECT
  id,
  sabha_week_id,
  role_id,
  person_id,
  NULL,
  custom_message,
  sent_at,
  confirmed_at,
  declined_at,
  decline_reason,
  follow_up_sent_at,
  send_count,
  needs_resend,
  telegram_message_id,
  created_at,
  updated_at
FROM assignments;

DROP TABLE assignments;
ALTER TABLE assignments_new RENAME TO assignments;

PRAGMA foreign_keys=on;
