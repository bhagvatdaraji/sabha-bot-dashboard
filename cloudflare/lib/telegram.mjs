import { telegramReplyMarkup } from "./helpers.mjs";

function botUrl(env, method) {
  return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function telegramRequest(env, method, payload) {
  const response = await fetch(botUrl(env, method), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram ${method} failed.`);
  }

  return data.result;
}

export async function setWebhook(env, webhookUrl) {
  return telegramRequest(env, "setWebhook", { url: webhookUrl });
}

export async function sendDirectMessage(env, chatId, text) {
  return telegramRequest(env, "sendMessage", {
    chat_id: String(chatId),
    text
  });
}

export async function sendGroupMessage(env, chatId, text) {
  return telegramRequest(env, "sendMessage", {
    chat_id: String(chatId),
    text
  });
}

export async function sendAssignmentMessage(env, assignment, sabhaWeek) {
  return telegramRequest(env, "sendMessage", {
    chat_id: String(assignment.telegramChatId),
    text: assignment.messageText,
    reply_markup: telegramReplyMarkup([[
      { text: "Confirm", callback_data: `confirm:${assignment.id}` },
      { text: "Can't do it", callback_data: `decline:${assignment.id}` }
    ]])
  });
}

export async function sendAssignmentFollowUp(env, assignment, messageText) {
  return telegramRequest(env, "sendMessage", {
    chat_id: String(assignment.telegramChatId),
    text: messageText,
    reply_markup: telegramReplyMarkup([[
      { text: "Confirm", callback_data: `confirm:${assignment.id}` },
      { text: "Can't do it", callback_data: `decline:${assignment.id}` }
    ]])
  });
}

export async function answerCallbackQuery(env, callbackQueryId, text) {
  return telegramRequest(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text
  });
}
