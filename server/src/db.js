const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { databasePath, uploadDir, outputDir } = require("./config");

const DEFAULT_ROLES = [
  "MC",
  "Dhun",
  "Prathna",
  "Kirtan",
  "Presentation 1",
  "Presentation 2"
];

const DEFAULT_TEMPLATES = {
  MC: "Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please be ready and confirm below.",
  Dhun: "Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please prepare and confirm below.",
  Prathna: "Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please prepare and confirm below.",
  Kirtan: "Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please prepare and confirm below.",
  "Presentation 1": "Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please be ready with your slides/material and confirm below.",
  "Presentation 2": "Jay Swaminarayan {{firstName}}, you are doing {{role}} for Kishore Sabha on {{date}} at {{time}}. Please be ready with your slides/material and confirm below."
};

function ensureDirectory(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

ensureDirectory(databasePath);
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const db = new Database(databasePath, { timeout: 5000 });
db.pragma("busy_timeout = 5000");
try {
  db.pragma("journal_mode = WAL");
} catch (error) {
  if (error.code !== "SQLITE_BUSY") {
    throw error;
  }
}

function migrate() {
  db.exec(`
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
      link_token TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sabha_weeks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabha_date TEXT NOT NULL,
      sabha_time TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabha_week_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      upload_id INTEGER,
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
      FOREIGN KEY (upload_id) REFERENCES uploads(id),
      UNIQUE (sabha_week_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL UNIQUE,
      template_text TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
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
      is_summary_target INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sabha_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabha_week_id INTEGER NOT NULL UNIQUE,
      upload_id INTEGER,
      message_text TEXT NOT NULL,
      sent_at TEXT,
      send_count INTEGER NOT NULL DEFAULT 0,
      telegram_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE,
      FOREIGN KEY (upload_id) REFERENCES uploads(id)
    );

    CREATE TABLE IF NOT EXISTS sabha_summary_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabha_week_id INTEGER NOT NULL,
      upload_id INTEGER,
      message_text TEXT NOT NULL,
      telegram_message_id TEXT,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE,
      FOREIGN KEY (upload_id) REFERENCES uploads(id)
    );

    CREATE TABLE IF NOT EXISTS sabha_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabha_week_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sabha_week_id) REFERENCES sabha_weeks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sabha_report_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabha_report_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      telegram_message_id TEXT,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sabha_report_id) REFERENCES sabha_reports(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES people(id)
    );
  `);

  ensureColumn("assignments", "declined_at", "TEXT");
  ensureColumn("assignments", "decline_reason", "TEXT");
  ensureColumn("assignments", "follow_up_sent_at", "TEXT");
  ensureColumn("assignments", "send_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("assignments", "needs_resend", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("telegram_chats", "is_summary_target", "INTEGER NOT NULL DEFAULT 0");
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function seedDefaults() {
  const insertRole = db.prepare("INSERT OR IGNORE INTO roles (name) VALUES (?)");
  DEFAULT_ROLES.forEach((roleName) => insertRole.run(roleName));

  const roles = db.prepare("SELECT id, name FROM roles").all();
  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO message_templates (role_id, template_text)
    VALUES (?, ?)
  `);

  roles.forEach((role) => {
    insertTemplate.run(role.id, DEFAULT_TEMPLATES[role.name] || DEFAULT_TEMPLATES.MC);
  });
}

migrate();
seedDefaults();

module.exports = {
  db,
  DEFAULT_ROLES
};
