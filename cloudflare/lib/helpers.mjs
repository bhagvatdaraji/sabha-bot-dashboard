import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const ALLOWED_CENTERS = ["San Francisco", "San Jose", "Sacramento"];

export function renderTemplate(template, variables) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_match, key) => variables[key] ?? "");
}

export function formatSabhaDate(date, tz) {
  return dayjs.tz(`${date}T00:00:00`, tz).format("dddd, MMMM D, YYYY");
}

export function formatSabhaTime(date, time, tz) {
  return dayjs.tz(`${date}T${time}`, tz).format("h:mm A");
}

export function combineSabhaDateTime(date, time, tz) {
  return dayjs.tz(`${date}T${time}`, tz);
}

export function isFutureSabha(date, time, tz, now = dayjs()) {
  return combineSabhaDateTime(date, time, tz).isAfter(now);
}

export function isSameOrPast(target, now = dayjs()) {
  return target.isSame(now) || target.isBefore(now);
}

export function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^['"]|['"]$/g, "");
}

export function parseAllowedOrigins(env) {
  return Array.from(new Set([
    ...String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean),
    normalizeOrigin(env.GITHUB_PAGES_ORIGIN),
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ].filter(Boolean)));
}

export function addCorsHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  const allowedOrigins = parseAllowedOrigins(env);
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function corsPreflight(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = parseAllowedOrigins(env);
  const headers = new Headers();
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  return new Response(null, { status: 204, headers });
}

export function telegramReplyMarkup(buttonRows) {
  return {
    inline_keyboard: buttonRows
  };
}

export { dayjs };
