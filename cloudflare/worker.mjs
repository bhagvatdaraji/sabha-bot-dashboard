import { createAuthToken, requireAuth } from "./lib/auth.mjs";
import { addCorsHeaders, ALLOWED_CENTERS, corsPreflight, dayjs, jsonResponse } from "./lib/helpers.mjs";
import {
  buildAssignmentFollowUpMessage,
  clearBotSession,
  confirmAssignment,
  consumeLinkToken,
  createPerson,
  createSabhaWeek,
  deletePerson,
  deleteSabhaWeek,
  declineAssignment,
  findUpcomingSabha,
  generateLinkToken,
  getAssignmentById,
  getBotSession,
  getCoordinator,
  getHistory,
  getNotificationAssignments,
  getOverview,
  getPendingFollowUpAssignments,
  getPeople,
  getPersonById,
  getPersonByTelegramChatId,
  getReminderSnapshot,
  getRoles,
  getSabhaWeekById,
  getSetting,
  getTemplates,
  logConfirmationEvent,
  markAssignmentSent,
  markFollowUpSent,
  saveBotSession,
  setSetting,
  updatePerson,
  updateSabhaWeek,
  updateTemplate,
  upsertAssignments,
  upsertPersonFromTelegram,
  upsertTelegramChat
} from "./lib/store.mjs";
import {
  answerCallbackQuery,
  sendAssignmentFollowUp,
  sendAssignmentMessage,
  sendDirectMessage,
  telegramRequest
} from "./lib/telegram.mjs";

async function readJson(request) {
  try {
    return await request.json();
  } catch (_error) {
    return {};
  }
}

function unauthorized() {
  return jsonResponse({ error: "Unauthorized" }, { status: 401 });
}

function notFound() {
  return jsonResponse({ error: "Not found" }, { status: 404 });
}

function errorResponse(error, status = 400) {
  return jsonResponse({ error: error.message || "Request failed" }, { status });
}

async function notifyCoordinator(env, text) {
  const coordinator = await getCoordinator(env);
  if (!coordinator?.telegramChatId) {
    return false;
  }

  await sendDirectMessage(env, coordinator.telegramChatId, text);
  return true;
}

async function sendAssignments(env, sabhaWeekId) {
  const { sabhaWeek, assignments } = await getNotificationAssignments(env, sabhaWeekId);
  const results = [];

  for (const assignment of assignments) {
    try {
      if (!assignment.telegramChatId) {
        throw new Error(`${assignment.personName} does not have a linked Telegram account yet.`);
      }
      const response = await sendAssignmentMessage(env, assignment, sabhaWeek);
      await markAssignmentSent(env, assignment.id, response.message_id);
      results.push({ assignmentId: assignment.id, ok: true });
    } catch (error) {
      results.push({ assignmentId: assignment.id, ok: false, error: error.message });
    }
  }

  return { sabhaWeekId, results };
}

async function processStartCommand(env, message) {
  const token = (message.text || "").split(" ")[1];
  if (!token) {
    const existing = await getPersonByTelegramChatId(env, message.chat.id);
    if (existing) {
      await sendDirectMessage(
        env,
        message.chat.id,
        `Jay Swaminarayan ${existing.firstName}. You are already connected and will receive future Kishore Sabha messages here.`
      );
      return;
    }

    await saveBotSession(env, message.chat.id, "register_first_name", {});
    await sendDirectMessage(env, message.chat.id, "Jay Swaminarayan. Let's get you connected. What is your first name?");
    return;
  }

  const person = await consumeLinkToken(env, token, message.chat.id, message.from?.username);
  if (!person) {
    await sendDirectMessage(env, message.chat.id, "That connect code is not valid anymore. Please generate a new one from the dashboard.");
    return;
  }

  await sendDirectMessage(
    env,
    message.chat.id,
    `You are now linked as ${person.firstName} ${person.lastName}. Future Kishore Sabha assignments will come here.`
  );
}

async function processRegistrationMessage(env, message, session) {
  const answer = (message.text || "").trim();
  if (!answer) {
    await sendDirectMessage(env, message.chat.id, "Please send a text reply so I can continue.");
    return true;
  }

  if (!session) {
    await saveBotSession(env, message.chat.id, "register_first_name", {});
    await sendDirectMessage(env, message.chat.id, "Jay Swaminarayan. What is your first name?");
    return true;
  }

  if (session.state === "register_first_name") {
    await saveBotSession(env, message.chat.id, "register_last_name", { ...session.payload, firstName: answer });
    await sendDirectMessage(env, message.chat.id, "What is your last name?");
    return true;
  }

  if (session.state === "register_last_name") {
    await saveBotSession(env, message.chat.id, "register_bkms_id", { ...session.payload, lastName: answer });
    await sendDirectMessage(env, message.chat.id, "What is your BKMS ID?");
    return true;
  }

  if (session.state === "register_bkms_id") {
    await saveBotSession(env, message.chat.id, "register_center", { ...session.payload, bkmsId: answer });
    await sendDirectMessage(
      env,
      message.chat.id,
      `Which center are you from? Reply with exactly one of: ${ALLOWED_CENTERS.join(", ")}.`
    );
    return true;
  }

  if (session.state === "register_center") {
    if (!ALLOWED_CENTERS.includes(answer)) {
      await sendDirectMessage(
        env,
        message.chat.id,
        `Please reply with one of these centers exactly: ${ALLOWED_CENTERS.join(", ")}.`
      );
      return true;
    }

    const person = await upsertPersonFromTelegram(env, {
      ...session.payload,
      center: answer,
      telegramChatId: message.chat.id,
      telegramUsername: message.from?.username || null
    });
    await clearBotSession(env, message.chat.id);
    await sendDirectMessage(
      env,
      message.chat.id,
      `Thanks ${person.firstName}. You are now registered and will receive Kishore Sabha assignments here.`
    );
    return true;
  }

  if (session.state === "decline_reason") {
    const assignmentId = Number(session.payload.assignmentId);
    const { assignment, alreadyDeclined } = await declineAssignment(env, assignmentId, answer);
    await clearBotSession(env, message.chat.id);

    if (!assignment) {
      await sendDirectMessage(env, message.chat.id, "I could not find that assignment anymore.");
      return true;
    }

    if (alreadyDeclined) {
      await sendDirectMessage(env, message.chat.id, "This assignment was already marked as declined.");
      return true;
    }

    await logConfirmationEvent(env, assignment.id, "declined", answer);
    await sendDirectMessage(env, message.chat.id, "Thanks. I marked this assignment as declined and shared your reason with the coordinator.");
    await notifyCoordinator(env, `${assignment.personName} declined ${assignment.roleName}. Reason: ${answer}`);
    return true;
  }

  return false;
}

async function processCallbackQuery(env, callbackQuery) {
  const data = callbackQuery.data || "";
  const assignmentId = Number(data.split(":")[1]);
  const assignment = await getAssignmentById(env, assignmentId);
  if (!assignment) {
    await answerCallbackQuery(env, callbackQuery.id, "Assignment not found.");
    return;
  }

  if (data.startsWith("confirm:")) {
    const { assignment: updatedAssignment, alreadyConfirmed } = await confirmAssignment(env, assignmentId);
    if (alreadyConfirmed) {
      await answerCallbackQuery(env, callbackQuery.id, "Already confirmed.");
      return;
    }

    await logConfirmationEvent(env, assignmentId, "confirmed", "Confirmed via Telegram");
    await answerCallbackQuery(env, callbackQuery.id, "Confirmed. Thank you.");
    await notifyCoordinator(env, `${updatedAssignment.personName} confirmed ${updatedAssignment.roleName}.`);
    return;
  }

  if (data.startsWith("decline:")) {
    await saveBotSession(env, callbackQuery.message.chat.id, "decline_reason", { assignmentId });
    await answerCallbackQuery(env, callbackQuery.id, "Please send a short reason.");
    await sendDirectMessage(
      env,
      callbackQuery.message.chat.id,
      `Please reply with the reason you cannot do ${assignment.roleName}.`
    );
  }
}

async function handleTelegramWebhook(request, env) {
  const update = await readJson(request);

  if (update.message?.chat) {
    await upsertTelegramChat(env, update.message.chat);
    if (update.message.chat.type !== "private") {
      return jsonResponse({ ok: true });
    }
    const session = await getBotSession(env, update.message.chat.id);

    if (update.message.text?.startsWith("/start")) {
      await processStartCommand(env, update.message);
      return jsonResponse({ ok: true });
    }

    if (update.message.text?.startsWith("/register")) {
      await saveBotSession(env, update.message.chat.id, "register_first_name", {});
      await sendDirectMessage(env, update.message.chat.id, "Jay Swaminarayan. What is your first name?");
      return jsonResponse({ ok: true });
    }

    if (await processRegistrationMessage(env, update.message, session)) {
      return jsonResponse({ ok: true });
    }
  }

  if (update.callback_query) {
    await processCallbackQuery(env, update.callback_query);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
}

async function runScheduledJobs(controller, env) {
  const now = dayjs();
  const localNow = now.tz(env.TIMEZONE || "America/Los_Angeles");

  const pending = await getPendingFollowUpAssignments(env, now);
  for (const assignment of pending) {
    if (controller.signal.aborted) {
      return;
    }
    const sabhaWeek = await getSabhaWeekById(env, assignment.sabhaWeekId);
    const followUpText = await buildAssignmentFollowUpMessage(env, assignment, sabhaWeek);
    await sendAssignmentFollowUp(env, assignment, followUpText);
    await markFollowUpSent(env, assignment.id);
  }

  const snapshot = await getReminderSnapshot(env, now);
  if (!snapshot.shouldRemind || !snapshot.coordinator?.telegramChatId) {
    return;
  }

  if (localNow.day() === 6 && localNow.hour() === 20) {
    const reminderKey = `weekly:${localNow.format("YYYY-MM-DD")}`;
    if ((await getSetting(env, "last_weekly_reminder_key")) !== reminderKey) {
      await sendDirectMessage(env, snapshot.coordinator.telegramChatId, "Jay Swaminarayan. Please create next week's Kishore Sabha syllabus.");
      await setSetting(env, "last_weekly_reminder_key", reminderKey);
    }
  }

  if (localNow.hour() === 12) {
    const reminderKey = `daily:${localNow.format("YYYY-MM-DD")}`;
    if ((await getSetting(env, "last_daily_reminder_key")) !== reminderKey) {
      await sendDirectMessage(env, snapshot.coordinator.telegramChatId, "Jay Swaminarayan. There is still no upcoming Kishore Sabha scheduled. Please create next week's Sabha syllabus.");
      await setSetting(env, "last_daily_reminder_key", reminderKey);
    }
  }
}

async function routeApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/api/health" && method === "GET") {
    return jsonResponse({
      ok: true,
      telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
      timezone: env.TIMEZONE || "America/Los_Angeles"
    });
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await readJson(request);
    if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
      return errorResponse(new Error("Invalid password."), 401);
    }
    const token = await createAuthToken(env);
    return jsonResponse({ token });
  }

  if (!(await requireAuth(request, env))) {
    return unauthorized();
  }

  if (pathname === "/api/bootstrap" && method === "GET") {
    return jsonResponse({
      overview: await getOverview(env),
      people: await getPeople(env),
      roles: await getRoles(env),
      templates: await getTemplates(env),
      history: await getHistory(env),
      botUsername: env.BOT_USERNAME || ""
    });
  }

  if (pathname === "/api/overview" && method === "GET") {
    return jsonResponse(await getOverview(env));
  }

  if (pathname === "/api/people" && method === "GET") {
    return jsonResponse(await getPeople(env));
  }

  if (pathname === "/api/people" && method === "POST") {
    return jsonResponse(await createPerson(env, await readJson(request)), { status: 201 });
  }

  const personIdMatch = pathname.match(/^\/api\/people\/(\d+)$/);
  if (personIdMatch && method === "PUT") {
    return jsonResponse(await updatePerson(env, Number(personIdMatch[1]), await readJson(request)));
  }
  if (personIdMatch && method === "DELETE") {
    await deletePerson(env, Number(personIdMatch[1]));
    return new Response(null, { status: 204 });
  }

  const linkTokenMatch = pathname.match(/^\/api\/people\/(\d+)\/link-token$/);
  if (linkTokenMatch && method === "POST") {
    return jsonResponse(await generateLinkToken(env, Number(linkTokenMatch[1])));
  }

  const messageMatch = pathname.match(/^\/api\/people\/(\d+)\/message$/);
  if (messageMatch && method === "POST") {
    const person = await getPersonById(env, Number(messageMatch[1]));
    if (!person) {
      return notFound();
    }
    if (!person.telegramChatId) {
      return errorResponse(new Error("This person has not linked Telegram yet."));
    }
    const body = await readJson(request);
    const response = await sendDirectMessage(env, person.telegramChatId, String(body.message || "").trim());
    return jsonResponse({ ok: true, messageId: response.message_id });
  }

  if (pathname === "/api/roles" && method === "GET") {
    return jsonResponse(await getRoles(env));
  }

  if (pathname === "/api/templates" && method === "GET") {
    return jsonResponse(await getTemplates(env));
  }

  const templateMatch = pathname.match(/^\/api\/templates\/(\d+)$/);
  if (templateMatch && method === "PUT") {
    const body = await readJson(request);
    return jsonResponse(await updateTemplate(env, Number(templateMatch[1]), body.templateText));
  }

  if (pathname === "/api/history" && method === "GET") {
    return jsonResponse(await getHistory(env));
  }

  if (pathname === "/api/sabha-weeks" && method === "POST") {
    return jsonResponse(await createSabhaWeek(env, await readJson(request)), { status: 201 });
  }

  const weekMatch = pathname.match(/^\/api\/sabha-weeks\/(\d+)$/);
  if (weekMatch && method === "GET") {
    const week = await getSabhaWeekById(env, Number(weekMatch[1]));
    return week ? jsonResponse(week) : notFound();
  }
  if (weekMatch && method === "PUT") {
    return jsonResponse(await updateSabhaWeek(env, Number(weekMatch[1]), await readJson(request)));
  }
  if (weekMatch && method === "DELETE") {
    await deleteSabhaWeek(env, Number(weekMatch[1]));
    return new Response(null, { status: 204 });
  }

  const weekAssignmentsMatch = pathname.match(/^\/api\/sabha-weeks\/(\d+)\/assignments$/);
  if (weekAssignmentsMatch && method === "PUT") {
    const body = await readJson(request);
    return jsonResponse(await upsertAssignments(env, Number(weekAssignmentsMatch[1]), body.assignments || []));
  }

  const weekSendMatch = pathname.match(/^\/api\/sabha-weeks\/(\d+)\/send$/);
  if (weekSendMatch && method === "POST") {
    return jsonResponse(await sendAssignments(env, Number(weekSendMatch[1])));
  }

  return notFound();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsPreflight(request, env);
    }

    let response;
    try {
      if (url.pathname === "/telegram/webhook" && request.method === "POST") {
        response = await handleTelegramWebhook(request, env);
      } else {
        response = await routeApi(request, env, url);
      }
    } catch (error) {
      console.error(error);
      response = errorResponse(error, error.status || 500);
    }

    return addCorsHeaders(response, request, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledJobs(controller, env));
  }
};
