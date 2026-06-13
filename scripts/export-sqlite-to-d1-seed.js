#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const projectRoot = path.resolve(__dirname, "..");
const sqlitePath = path.join(projectRoot, "data", "kishore.sqlite");
const outputPath = path.join(projectRoot, "cloudflare", "seed.sql");

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite database not found at ${sqlitePath}`);
  process.exit(1);
}

const db = new Database(sqlitePath, { readonly: true });

function tableExists(tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function escapeValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInsert(tableName, columns, rows) {
  if (!rows.length) {
    return "";
  }

  return rows.map((row) => {
    const values = columns.map((column) => escapeValue(row[column]));
    return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${values.join(", ")});`;
  }).join("\n");
}

const tables = [
  ["people", ["id", "first_name", "last_name", "bkms_id", "center", "telegram_chat_id", "telegram_username", "active", "is_coordinator", "created_at", "updated_at"]],
  ["roles", ["id", "name", "active"]],
  ["message_templates", ["id", "role_id", "template_text", "updated_at"]],
  ["sabha_weeks", ["id", "sabha_date", "sabha_time", "notes", "status", "created_at", "updated_at"]],
  ["assignments", ["id", "sabha_week_id", "role_id", "person_id", "custom_message", "sent_at", "confirmed_at", "declined_at", "decline_reason", "follow_up_sent_at", "send_count", "needs_resend", "telegram_message_id", "created_at", "updated_at"]],
  ["confirmation_events", ["id", "assignment_id", "event_type", "event_text", "created_at"]],
  ["telegram_chats", ["chat_id", "chat_type", "title", "username", "created_at", "updated_at"]],
  ["app_settings", ["key", "value", "updated_at"]]
];

const sections = [
  "-- Generated from local SQLite for Cloudflare D1 import",
  "PRAGMA defer_foreign_keys = on;",
  "DELETE FROM confirmation_events;",
  "DELETE FROM assignments;",
  "DELETE FROM link_tokens;",
  "DELETE FROM bot_sessions;",
  "DELETE FROM telegram_chats;",
  "DELETE FROM app_settings;",
  "DELETE FROM sabha_weeks;",
  "DELETE FROM message_templates;",
  "DELETE FROM roles;",
  "DELETE FROM people;"
];

for (const [tableName, columns] of tables) {
  if (!tableExists(tableName)) {
    continue;
  }
  const rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${tableName}`).all();
  const sql = buildInsert(tableName, columns, rows);
  if (sql) {
    sections.push(`\n-- ${tableName}\n${sql}`);
  }
}

fs.writeFileSync(outputPath, `${sections.join("\n")}\n`, "utf8");
console.log(`D1 seed SQL written to ${outputPath}`);
