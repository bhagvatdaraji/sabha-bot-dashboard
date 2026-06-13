const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const { telegramBotToken, timezone } = require("./config");
const {
  consumeLinkToken,
  getAssignmentById,
  getSabhaWeekById,
  getPersonByTelegramChatId,
  getPersonById,
  getCoordinator,
  confirmAssignment,
  declineAssignment,
  logConfirmationEvent,
  markAssignmentSent,
  markSabhaSummarySent,
  logSabhaReportSent,
  getSummaryChat,
  upsertPersonFromTelegram,
  upsertTelegramChat,
  setSummaryChatTarget,
  getBotSession,
  saveBotSession,
  clearBotSession,
  ALLOWED_CENTERS
} = require("./store");
const { formatSabhaDate } = require("./helpers");

let botInstance = null;

function hasTelegramConfig() {
  return Boolean(telegramBotToken);
}

function isImageUpload(uploadPath, mimeType) {
  if (mimeType?.startsWith("image/")) {
    return true;
  }

  const extension = path.extname(uploadPath || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
}

function getBot({ polling = false } = {}) {
  if (!hasTelegramConfig()) {
    return null;
  }

  if (!botInstance) {
    botInstance = new TelegramBot(telegramBotToken, { polling });
  }

  return botInstance;
}

async function sendAssignmentNotification(assignment, sabhaWeek) {
  const bot = getBot();
  if (!bot) {
    throw new Error("Telegram bot token is not configured.");
  }

  if (!assignment.telegramChatId) {
    throw new Error(`${assignment.personName} does not have a linked Telegram account yet.`);
  }

  const replyMarkup = {
    inline_keyboard: [[
      { text: "Confirm", callback_data: `confirm:${assignment.id}` },
      { text: "Can't do it", callback_data: `decline:${assignment.id}` }
    ]]
  };

  let response;
  if (assignment.uploadPath && fs.existsSync(assignment.uploadPath)) {
    response = await bot.sendDocument(assignment.telegramChatId, assignment.uploadPath, {
      caption: assignment.messageText,
      reply_markup: replyMarkup
    });
  } else {
    response = await bot.sendMessage(assignment.telegramChatId, assignment.messageText, {
      reply_markup: replyMarkup
    });
  }

  markAssignmentSent(assignment.id, response.message_id);
  return response;
}

async function sendAssignmentFollowUp(assignment, messageText) {
  const bot = getBot();
  if (!bot) {
    throw new Error("Telegram bot token is not configured.");
  }

  return bot.sendMessage(assignment.telegramChatId, messageText, {
    reply_markup: {
      inline_keyboard: [[
        { text: "Confirm", callback_data: `confirm:${assignment.id}` },
        { text: "Can't do it", callback_data: `decline:${assignment.id}` }
      ]]
    }
  });
}

async function sendDirectMessage(chatId, text) {
  const bot = getBot();
  if (!bot) {
    throw new Error("Telegram bot token is not configured.");
  }

  return bot.sendMessage(chatId, text);
}

async function sendGroupMessage(text) {
  const bot = getBot();
  if (!bot) {
    throw new Error("Telegram bot token is not configured.");
  }

  const summaryChat = getSummaryChat();
  if (!summaryChat?.chatId) {
    throw new Error("No summary group is connected yet.");
  }

  const message = text?.trim();
  if (!message) {
    throw new Error("Message is required.");
  }

  const response = await bot.sendMessage(summaryChat.chatId, message);
  return { response, summaryChat };
}

async function sendSabhaSummary(summary) {
  const bot = getBot();
  if (!bot) {
    throw new Error("Telegram bot token is not configured.");
  }

  const summaryChat = getSummaryChat();
  if (!summaryChat?.chatId) {
    throw new Error("The SF KISHORE MANDAL group has not been detected yet. Send one message in that group with the bot present.");
  }

  let response;
  if (summary.uploadPath && fs.existsSync(summary.uploadPath)) {
    if (isImageUpload(summary.uploadPath, summary.uploadMimeType)) {
      response = await bot.sendPhoto(summaryChat.chatId, summary.uploadPath, {
        caption: summary.messageText
      });
    } else {
      response = await bot.sendDocument(summaryChat.chatId, summary.uploadPath, {
        caption: summary.messageText
      });
    }
  } else {
    response = await bot.sendMessage(summaryChat.chatId, summary.messageText);
  }

  markSabhaSummarySent(summary.sabhaWeekId, response.message_id);
  return { response, summaryChat };
}

async function sendSabhaReport(report, personId) {
  const bot = getBot();
  if (!bot) {
    throw new Error("Telegram bot token is not configured.");
  }

  const recipient = personId ? getPersonById(personId) : getCoordinator();
  if (!recipient) {
    throw new Error("No recipient found for the report.");
  }

  if (!recipient.telegramChatId) {
    throw new Error(`${recipient.firstName} ${recipient.lastName} does not have a linked Telegram account.`);
  }

  if (!report?.filePath || !fs.existsSync(report.filePath)) {
    throw new Error("Report file was not found.");
  }

  const response = await bot.sendDocument(recipient.telegramChatId, report.filePath, {
    caption: `Jai Swaminaryan! Here is the Sabha report for ${report.fileName.replace(/\.xlsx$/i, "")}.`
  });

  logSabhaReportSent(report.id, recipient.id, response.message_id);
  return { response, recipient };
}

async function notifyCoordinator(text) {
  const bot = getBot();
  const coordinator = getCoordinator();
  if (!bot || !coordinator?.telegramChatId) {
    return false;
  }

  await bot.sendMessage(coordinator.telegramChatId, text);
  return true;
}

async function processStartCommand(message) {
  const token = message.text.split(" ")[1];
  if (!token) {
    const existingPerson = getPersonByTelegramChatId(message.chat.id);
    if (existingPerson) {
      await getBot().sendMessage(
        message.chat.id,
        `Jay Swaminarayan ${existingPerson.firstName}. You are already connected and will receive future Kishore Sabha messages here.`
      );
      return;
    }

    saveBotSession(message.chat.id, "register_first_name", {});
    await getBot().sendMessage(
      message.chat.id,
      "Jay Swaminarayan. Let's get you connected. What is your first name?"
    );
    return;
  }

  const person = consumeLinkToken(token, message.chat.id, message.from?.username);
  if (!person) {
    await getBot().sendMessage(message.chat.id, "That connect code is not valid anymore. Please generate a new one from the dashboard.");
    return;
  }

  await getBot().sendMessage(
    message.chat.id,
    `You are now linked as ${person.firstName} ${person.lastName}. Future Kishore Sabha assignments will come here.`
  );
}

async function processRegistrationMessage(message) {
  const session = getBotSession(message.chat.id);
  if (!session) {
    saveBotSession(message.chat.id, "register_first_name", {});
    await getBot().sendMessage(message.chat.id, "Jay Swaminarayan. What is your first name?");
    return true;
  }

  const answer = (message.text || "").trim();
  if (!answer) {
    await getBot().sendMessage(message.chat.id, "Please send a text reply so I can continue.");
    return true;
  }

  if (session.state === "register_first_name") {
    saveBotSession(message.chat.id, "register_last_name", {
      ...session.payload,
      firstName: answer
    });
    await getBot().sendMessage(message.chat.id, "What is your last name?");
    return true;
  }

  if (session.state === "register_last_name") {
    saveBotSession(message.chat.id, "register_bkms_id", {
      ...session.payload,
      lastName: answer
    });
    await getBot().sendMessage(message.chat.id, "What is your BKMS ID?");
    return true;
  }

  if (session.state === "register_bkms_id") {
    saveBotSession(message.chat.id, "register_center", {
      ...session.payload,
      bkmsId: answer
    });
    await getBot().sendMessage(message.chat.id, "Choose your center:", {
      reply_markup: {
        keyboard: [ALLOWED_CENTERS.map((center) => ({ text: center }))],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
    return true;
  }

  if (session.state === "register_center") {
    if (!ALLOWED_CENTERS.includes(answer)) {
      await getBot().sendMessage(message.chat.id, "Please choose one of these centers: San Francisco, San Jose, or Sacramento.");
      return true;
    }

    const person = upsertPersonFromTelegram({
      ...session.payload,
      center: answer,
      telegramChatId: message.chat.id,
      telegramUsername: message.from?.username
    });
    clearBotSession(message.chat.id);
    await getBot().sendMessage(
      message.chat.id,
      `You are now registered as ${person.firstName} ${person.lastName} from ${person.center}. Future Kishore Sabha messages will come here.`,
      {
        reply_markup: {
          remove_keyboard: true
        }
      }
    );
    return true;
  }

  return false;
}

async function processConfirmation(callbackQuery) {
  const assignmentId = Number(callbackQuery.data.split(":")[1]);
  const assignment = getAssignmentById(assignmentId);
  if (!assignment) {
    await getBot().answerCallbackQuery(callbackQuery.id, { text: "Assignment not found." });
    return;
  }

  const { assignment: updated, alreadyConfirmed } = confirmAssignment(assignmentId);
  if (!updated) {
    await getBot().answerCallbackQuery(callbackQuery.id, { text: "Assignment not found." });
    return;
  }

  if (alreadyConfirmed) {
    await getBot().answerCallbackQuery(callbackQuery.id, { text: "Already confirmed." });
    return;
  }

  const confirmationText = `${updated.personName} confirmed ${updated.roleName} for ${formatSabhaDate(
    getAssignmentWeekDate(updated.sabhaWeekId),
    timezone
  )}.`;
  logConfirmationEvent(assignmentId, "member_confirmed", confirmationText);
  await getBot().answerCallbackQuery(callbackQuery.id, { text: "Confirmed. Thank you!" });
  await getBot().sendMessage(callbackQuery.message.chat.id, `Confirmed: ${updated.roleName}.`);
  await notifyCoordinator(confirmationText);
}

function getAssignmentWeekDate(sabhaWeekId) {
  const row = getSabhaWeekById(sabhaWeekId);
  return row?.sabhaDate;
}

async function processDecline(callbackQuery) {
  const assignmentId = Number(callbackQuery.data.split(":")[1]);
  const assignment = getAssignmentById(assignmentId);
  if (!assignment) {
    await getBot().answerCallbackQuery(callbackQuery.id, { text: "Assignment not found." });
    return;
  }

  if (assignment.declinedAt) {
    await getBot().answerCallbackQuery(callbackQuery.id, { text: "Already marked." });
    return;
  }

  saveBotSession(callbackQuery.message.chat.id, "decline_reason", {
    assignmentId,
    roleName: assignment.roleName,
    personName: assignment.personName,
    sabhaWeekId: assignment.sabhaWeekId
  });
  await getBot().answerCallbackQuery(callbackQuery.id, { text: "Please send a short reason." });
  await getBot().sendMessage(
    callbackQuery.message.chat.id,
    `Please reply with the reason you can't do ${assignment.roleName}. I’ll send it to the Kishore coordinator.`
  );
}

async function processDeclineReason(message, session) {
  const reason = (message.text || "").trim();
  if (!reason) {
    await getBot().sendMessage(message.chat.id, "Please send a short reason so I can notify the coordinator.");
    return true;
  }

  const { assignment: updated, alreadyDeclined } = declineAssignment(session.payload.assignmentId, reason);
  if (!updated) {
    clearBotSession(message.chat.id);
    await getBot().sendMessage(message.chat.id, "That assignment could not be found anymore.");
    return true;
  }

  if (alreadyDeclined) {
    clearBotSession(message.chat.id);
    await getBot().sendMessage(message.chat.id, "That assignment was already marked as can't do.");
    return true;
  }

  const declineText = `${updated.personName} can't do ${updated.roleName} for ${formatSabhaDate(
    getAssignmentWeekDate(updated.sabhaWeekId),
    timezone
  )}. Reason: ${reason}`;
  logConfirmationEvent(updated.id, "member_declined", declineText);
  clearBotSession(message.chat.id);
  await getBot().sendMessage(message.chat.id, `Thanks. I've notified the Kishore coordinator about ${updated.roleName}.`);
  await notifyCoordinator(declineText);
  return true;
}

function registerBotHandlers() {
  const bot = getBot({ polling: true });
  if (!bot || bot.__kishoreHandlersBound) {
    return bot;
  }

  bot.onText(/^\/start(?:\s+(.+))?$/, async (message) => {
    try {
      await processStartCommand(message);
    } catch (error) {
      console.error("Failed to process /start:", error);
    }
  });

  bot.onText(/^\/register$/, async (message) => {
    try {
      saveBotSession(message.chat.id, "register_first_name", {});
      await getBot().sendMessage(message.chat.id, "Jay Swaminarayan. What is your first name?");
    } catch (error) {
      console.error("Failed to start registration:", error);
    }
  });

  bot.onText(/^\/setsummarygroup$/, async (message) => {
    try {
      if (message.chat?.type !== "group" && message.chat?.type !== "supergroup") {
        await getBot().sendMessage(message.chat.id, "Use /setsummarygroup inside the SF Kishore Mandal group.");
        return;
      }

      const chat = setSummaryChatTarget(message.chat);
      await getBot().sendMessage(
        message.chat.id,
        `This group is now set as the Sabha summary destination: ${chat.title || "current group"}.`
      );
    } catch (error) {
      console.error("Failed to set summary group:", error);
    }
  });

  bot.on("callback_query", async (callbackQuery) => {
    try {
      if (callbackQuery.data?.startsWith("confirm:")) {
        await processConfirmation(callbackQuery);
      } else if (callbackQuery.data?.startsWith("decline:")) {
        await processDecline(callbackQuery);
      }
    } catch (error) {
      console.error("Failed to process callback query:", error);
    }
  });

  bot.on("message", async (message) => {
    try {
      if (message.chat?.type === "group" || message.chat?.type === "supergroup") {
        upsertTelegramChat(message.chat);
      }

      if (!message.text || message.text.startsWith("/start") || message.text === "/register") {
        return;
      }

      const session = getBotSession(message.chat.id);
      if (session?.state === "decline_reason") {
        await processDeclineReason(message, session);
        return;
      }

      if (session || !getPersonByTelegramChatId(message.chat.id)) {
        await processRegistrationMessage(message);
      }
    } catch (error) {
      console.error("Failed to process message:", error);
    }
  });

  bot.__kishoreHandlersBound = true;
  return bot;
}

module.exports = {
  hasTelegramConfig,
  getBot,
  registerBotHandlers,
  sendAssignmentNotification,
  sendAssignmentFollowUp,
  sendDirectMessage,
  sendGroupMessage,
  sendSabhaSummary,
  sendSabhaReport,
  notifyCoordinator
};
