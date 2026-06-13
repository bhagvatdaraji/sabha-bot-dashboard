const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

function renderTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");
}

function formatSabhaDate(date, tz) {
  return dayjs.tz(`${date}T00:00:00`, tz).format("dddd, MMMM D, YYYY");
}

function formatSabhaDateTime(date, time, tz) {
  return dayjs.tz(`${date}T${time}`, tz).format("dddd, MMMM D, YYYY [at] h:mm A");
}

function combineSabhaDateTime(date, time, tz) {
  return dayjs.tz(`${date}T${time}`, tz);
}

function isFutureSabha(date, time, tz, now = dayjs()) {
  return combineSabhaDateTime(date, time, tz).isAfter(now);
}

module.exports = {
  dayjs,
  renderTemplate,
  formatSabhaDate,
  formatSabhaDateTime,
  combineSabhaDateTime,
  isFutureSabha
};
