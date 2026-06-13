const test = require("node:test");
const assert = require("node:assert/strict");
const { renderTemplate, isFutureSabha, dayjs } = require("./helpers");

test("renderTemplate replaces supported placeholders", () => {
  const text = renderTemplate("Hello {{firstName}}, you are doing {{role}} on {{date}}.", {
    firstName: "Neil",
    role: "Presentation 1",
    date: "Saturday"
  });

  assert.equal(text, "Hello Neil, you are doing Presentation 1 on Saturday.");
});

test("isFutureSabha returns false for past sabha", () => {
  const result = isFutureSabha("2025-01-01", "16:30", "America/Los_Angeles");
  assert.equal(result, false);
});

test("24 hour follow up threshold can be computed", () => {
  const sentAt = dayjs.utc("2026-06-10T00:00:00Z");
  const dueAt = sentAt.add(24, "hour");
  assert.equal(dueAt.format(), "2026-06-11T00:00:00Z");
});
