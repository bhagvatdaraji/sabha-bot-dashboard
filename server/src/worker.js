const cron = require("node-cron");
const { timezone } = require("./config");
const { dayjs } = require("./helpers");
const {
  registerBotHandlers,
  hasTelegramConfig,
  notifyCoordinator,
  sendAssignmentFollowUp
} = require("./telegram");
const {
  getReminderSnapshot,
  getPendingFollowUpAssignments,
  getSabhaWeekById,
  buildAssignmentFollowUpMessage,
  markFollowUpSent,
  logConfirmationEvent
} = require("./store");

async function sendCoordinatorReminder(reason) {
  const snapshot = getReminderSnapshot(dayjs());
  if (!snapshot.shouldRemind || !snapshot.coordinator?.telegramChatId) {
    return false;
  }

  const text =
    reason === "saturday"
      ? "Reminder: please create the next Kishore Sabha syllabus for the coming week."
      : "Reminder: the next Kishore Sabha is still not scheduled. Please create the syllabus when you can.";

  return notifyCoordinator(text);
}

function startWorker() {
  if (hasTelegramConfig()) {
    registerBotHandlers();
    console.log("Telegram polling started.");
  } else {
    console.log("Telegram polling skipped because TELEGRAM_BOT_TOKEN is not configured.");
  }

  cron.schedule("0 20 * * 6", () => {
    sendCoordinatorReminder("saturday").catch((error) => console.error("Saturday reminder failed:", error));
  }, { timezone });

  cron.schedule("0 12 * * *", () => {
    sendCoordinatorReminder("daily").catch((error) => console.error("Daily reminder failed:", error));
  }, { timezone });

  cron.schedule("0 * * * *", () => {
    processPendingFollowUps().catch((error) => console.error("Assignment follow-up failed:", error));
  }, { timezone });

  console.log(`Reminder scheduler active in timezone ${timezone}.`);
}

async function processPendingFollowUps() {
  const assignments = getPendingFollowUpAssignments(dayjs());
  for (const assignment of assignments) {
    const sabhaWeek = getSabhaWeekById(assignment.sabhaWeekId);
    if (!sabhaWeek) {
      continue;
    }

    await sendAssignmentFollowUp(assignment, buildAssignmentFollowUpMessage(assignment, sabhaWeek));
    markFollowUpSent(assignment.id);
    logConfirmationEvent(
      assignment.id,
      "follow_up_sent",
      `24-hour follow-up sent to ${assignment.personName} for ${assignment.roleName}.`
    );
  }
}

startWorker();
