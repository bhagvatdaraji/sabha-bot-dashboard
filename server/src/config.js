const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const rootDir = path.resolve(__dirname, "..", "..");

function resolveFromRoot(value, fallback) {
  const raw = value || fallback;
  return path.isAbsolute(raw) ? raw : path.join(rootDir, raw);
}

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^['"]|['"]$/g, "");
}

function parseOrigins(rawValue) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

const dashboardUrl = process.env.DASHBOARD_URL || "";
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const clientOriginAlt = process.env.CLIENT_ORIGIN_ALT || "http://127.0.0.1:5173";
const allowedOrigins = Array.from(new Set([
  ...parseOrigins(process.env.ALLOWED_ORIGINS),
  normalizeOrigin(process.env.CORS_ORIGIN),
  normalizeOrigin(clientOrigin),
  normalizeOrigin(clientOriginAlt),
  normalizeOrigin(dashboardUrl),
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4000",
  "http://127.0.0.1:4000"
].filter(Boolean)));

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 4000),
  clientOrigin,
  clientOriginAlt,
  dashboardUrl,
  allowedOrigins,
  timezone: process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
  databasePath: resolveFromRoot(process.env.DATABASE_PATH, "./data/kishore.sqlite"),
  uploadDir: resolveFromRoot(process.env.UPLOAD_DIR, "./uploads"),
  outputDir: resolveFromRoot(process.env.OUTPUT_DIR, "./outputs"),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || ""
};
