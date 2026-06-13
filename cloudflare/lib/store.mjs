import {
  ALLOWED_CENTERS,
  combineSabhaDateTime,
  dayjs,
  formatSabhaDate,
  formatSabhaTime,
  isFutureSabha,
  isSameOrPast,
  renderTemplate
} from "./helpers.mjs";

function mapPerson(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    bkmsId: row.bkms_id,
    center: row.center,
    telegramChatId: row.telegram_chat_id,
    telegramUsername: row.telegram_username,
    active: Boolean(row.active),
    isCoordinator: Boolean(row.is_coordinator),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAssignment(row) {
  const firstName = row.first_name || (row.placeholder_name ? row.placeholder_name.split(" ")[0] : "");
  const lastName = row.first_name ? row.last_name : "";
  const personName = row.first_name
    ? `${row.first_name} ${row.last_name}`
    : (row.placeholder_name || "Unassigned placeholder");
  return {
    id: row.assignment_id ?? row.id,
    sabhaWeekId: row.sabha_week_id,
    roleId: row.role_id,
    roleName: row.role_name,
    personId: row.person_id,
    placeholderName: row.placeholder_name || "",
    isPlaceholder: !row.person_id,
    personName,
    firstName,
    lastName,
    bkmsId: row.bkms_id,
    telegramChatId: row.telegram_chat_id,
    customMessage: row.custom_message,
    templateText: row.template_text,
    sentAt: row.sent_at,
    confirmedAt: row.confirmed_at,
    declinedAt: row.declined_at,
    declineReason: row.decline_reason,
    followUpSentAt: row.follow_up_sent_at,
    sendCount: row.send_count || 0,
    needsResend: Boolean(row.needs_resend),
    telegramMessageId: row.telegram_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSummary(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sabhaWeekId: row.sabha_week_id,
    messageText: row.message_text,
    sentAt: row.sent_at,
    sendCount: row.send_count || 0,
    telegramMessageId: row.telegram_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSummarySend(row) {
  return {
    id: row.id,
    sabhaWeekId: row.sabha_week_id,
    messageText: row.message_text,
    telegramMessageId: row.telegram_message_id,
    sentAt: row.sent_at
  };
}

async function queryAll(env, sql, ...params) {
  const result = await env.DB.prepare(sql).bind(...params).all();
  return result.results || [];
}

async function queryFirst(env, sql, ...params) {
  const result = await env.DB.prepare(sql).bind(...params).first();
  return result || null;
}

async function execute(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).run();
}

export async function tryRecordProcessedUpdate(env, updateId) {
  if (typeof updateId !== "number") {
    return true;
  }

  try {
    await execute(
      env,
      "INSERT INTO processed_updates (update_id) VALUES (?)",
      updateId
    );
    return true;
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("unique") || message.includes("primary key")) {
      return false;
    }
    throw error;
  }
}

export async function getPeople(env) {
  return (await queryAll(env, "SELECT * FROM people ORDER BY first_name, last_name")).map(mapPerson);
}

export async function getPersonById(env, id) {
  return mapPerson(await queryFirst(env, "SELECT * FROM people WHERE id = ?", id));
}

export async function getPersonByTelegramChatId(env, chatId) {
  return mapPerson(await queryFirst(env, "SELECT * FROM people WHERE telegram_chat_id = ? LIMIT 1", String(chatId)));
}

export async function getCoordinator(env) {
  return mapPerson(await queryFirst(env, "SELECT * FROM people WHERE is_coordinator = 1 LIMIT 1"));
}

export async function createPerson(env, input) {
  const telegramChatId = input.telegramChatId ? String(input.telegramChatId).trim() : null;
  const existing = await queryFirst(env, "SELECT id FROM people WHERE bkms_id = ?", input.bkmsId);
  if (existing) {
    return updatePerson(env, existing.id, input);
  }

  if (input.isCoordinator) {
    await execute(env, "UPDATE people SET is_coordinator = 0");
  }

  const result = await execute(
    env,
    `INSERT INTO people (
      first_name, last_name, bkms_id, center, telegram_chat_id, active, is_coordinator, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    input.firstName,
    input.lastName,
    input.bkmsId,
    input.center,
    telegramChatId,
    input.active ? 1 : 0,
    input.isCoordinator ? 1 : 0
  );

  return getPersonById(env, Number(result.meta.last_row_id));
}

export async function updatePerson(env, id, input) {
  const telegramChatId = input.telegramChatId ? String(input.telegramChatId).trim() : null;
  if (input.isCoordinator) {
    await execute(env, "UPDATE people SET is_coordinator = 0");
  }

  await execute(
    env,
    `UPDATE people
     SET first_name = ?, last_name = ?, bkms_id = ?, center = ?,
         telegram_chat_id = ?, telegram_username = CASE WHEN ? IS NULL THEN NULL ELSE telegram_username END,
         active = ?, is_coordinator = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    input.firstName,
    input.lastName,
    input.bkmsId,
    input.center,
    telegramChatId,
    telegramChatId,
    input.active ? 1 : 0,
    input.isCoordinator ? 1 : 0,
    id
  );

  return getPersonById(env, id);
}

export async function deletePerson(env, personId) {
  const assignments = await queryAll(env, "SELECT id FROM assignments WHERE person_id = ?", personId);
  for (const assignment of assignments) {
    await execute(env, "DELETE FROM confirmation_events WHERE assignment_id = ?", assignment.id);
  }
  await execute(env, "DELETE FROM assignments WHERE person_id = ?", personId);
  await execute(env, "DELETE FROM people WHERE id = ?", personId);
}

export async function getRoles(env) {
  return queryAll(env, "SELECT id, name FROM roles WHERE active = 1 ORDER BY id");
}

export async function getTemplates(env) {
  return (await queryAll(
    env,
    `SELECT mt.id, mt.template_text, mt.updated_at, r.id AS role_id, r.name AS role_name
     FROM message_templates mt
     JOIN roles r ON r.id = mt.role_id
     ORDER BY r.id`
  )).map((row) => ({
    id: row.id,
    roleId: row.role_id,
    roleName: row.role_name,
    templateText: row.template_text,
    updatedAt: row.updated_at
  }));
}

export async function updateTemplate(env, roleId, templateText) {
  await execute(
    env,
    "UPDATE message_templates SET template_text = ?, updated_at = CURRENT_TIMESTAMP WHERE role_id = ?",
    templateText,
    roleId
  );
  return getTemplates(env);
}

export async function createSabhaWeek(env, input) {
  const result = await execute(
    env,
    `INSERT INTO sabha_weeks (sabha_date, sabha_time, notes, status, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    input.sabhaDate,
    input.sabhaTime,
    input.notes || "",
    input.status || "scheduled"
  );
  return getSabhaWeekById(env, Number(result.meta.last_row_id));
}

export async function updateSabhaWeek(env, id, input) {
  await execute(
    env,
    `UPDATE sabha_weeks
     SET sabha_date = ?, sabha_time = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    input.sabhaDate,
    input.sabhaTime,
    input.notes || "",
    input.status || "scheduled",
    id
  );
  return getSabhaWeekById(env, id);
}

export async function deleteSabhaWeek(env, id) {
  const assignments = await queryAll(env, "SELECT id FROM assignments WHERE sabha_week_id = ?", id);
  for (const assignment of assignments) {
    await execute(env, "DELETE FROM confirmation_events WHERE assignment_id = ?", assignment.id);
  }
  await execute(env, "DELETE FROM assignments WHERE sabha_week_id = ?", id);
  await execute(env, "DELETE FROM sabha_weeks WHERE id = ?", id);
}

export async function getAssignmentsForWeek(env, sabhaWeekId) {
  return (await queryAll(
    env,
    `SELECT
      a.id AS assignment_id,
      a.*,
      r.name AS role_name,
      a.placeholder_name,
      p.first_name,
      p.last_name,
      p.bkms_id,
      p.telegram_chat_id,
      mt.template_text
     FROM assignments a
     JOIN roles r ON r.id = a.role_id
     LEFT JOIN people p ON p.id = a.person_id
     LEFT JOIN message_templates mt ON mt.role_id = a.role_id
     WHERE a.sabha_week_id = ?
     ORDER BY a.role_id`,
    sabhaWeekId
  )).map(mapAssignment);
}

export async function getAssignmentById(env, assignmentId) {
  const row = await queryFirst(
    env,
    `SELECT
      a.id AS assignment_id,
      a.*,
      r.name AS role_name,
      a.placeholder_name,
      p.first_name,
      p.last_name,
      p.bkms_id,
      p.telegram_chat_id,
      mt.template_text
     FROM assignments a
     JOIN roles r ON r.id = a.role_id
     LEFT JOIN people p ON p.id = a.person_id
     LEFT JOIN message_templates mt ON mt.role_id = a.role_id
     WHERE a.id = ?`,
    assignmentId
  );
  return row ? mapAssignment(row) : null;
}

export async function upsertAssignments(env, sabhaWeekId, assignments) {
  const existing = await queryAll(env, "SELECT role_id FROM assignments WHERE sabha_week_id = ?", sabhaWeekId);
  const existingRoleIds = existing.map((row) => row.role_id);
  const incomingRoleIds = new Set(assignments.map((item) => item.roleId));

  for (const roleId of existingRoleIds) {
    if (!incomingRoleIds.has(roleId)) {
      const existingAssignment = await queryFirst(
        env,
        "SELECT id FROM assignments WHERE sabha_week_id = ? AND role_id = ?",
        sabhaWeekId,
        roleId
      );
      if (existingAssignment) {
        await execute(env, "DELETE FROM confirmation_events WHERE assignment_id = ?", existingAssignment.id);
      }
      await execute(env, "DELETE FROM assignments WHERE sabha_week_id = ? AND role_id = ?", sabhaWeekId, roleId);
    }
  }

  for (const item of assignments) {
    const personId = item.personId ? Number(item.personId) : null;
    const placeholderName = personId ? null : (item.placeholderName || "").trim() || null;
    const current = await queryFirst(
      env,
      `SELECT id, person_id, placeholder_name, custom_message, sent_at, send_count, needs_resend, telegram_message_id,
              confirmed_at, declined_at, decline_reason, follow_up_sent_at
       FROM assignments WHERE sabha_week_id = ? AND role_id = ?`,
      sabhaWeekId,
      item.roleId
    );

    if (!current) {
      await execute(
        env,
        `INSERT INTO assignments (
          sabha_week_id, role_id, person_id, placeholder_name, custom_message, needs_resend, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
        sabhaWeekId,
        item.roleId,
        personId,
        placeholderName,
        item.customMessage || null
      );
      continue;
    }

    const personChanged = current.person_id !== personId || (current.placeholder_name || "") !== (placeholderName || "");
    const messageChanged = (current.custom_message || "") !== (item.customMessage || "");
    const sentBefore = Boolean(current.sent_at);
    const needsResend = sentBefore && (personChanged || messageChanged);

    await execute(
      env,
      `UPDATE assignments
       SET person_id = ?, placeholder_name = ?, custom_message = ?,
           confirmed_at = CASE WHEN ? = 1 THEN NULL ELSE confirmed_at END,
           declined_at = CASE WHEN ? = 1 THEN NULL ELSE declined_at END,
           decline_reason = CASE WHEN ? = 1 THEN NULL ELSE decline_reason END,
           follow_up_sent_at = CASE WHEN ? = 1 THEN NULL ELSE follow_up_sent_at END,
           sent_at = CASE WHEN ? = 1 THEN NULL ELSE sent_at END,
           send_count = CASE WHEN ? = 1 THEN 0 ELSE send_count END,
           needs_resend = ?,
           telegram_message_id = CASE WHEN ? = 1 THEN NULL ELSE telegram_message_id END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      personId,
      placeholderName,
      item.customMessage || null,
      personChanged ? 1 : 0,
      personChanged ? 1 : 0,
      personChanged ? 1 : 0,
      personChanged ? 1 : 0,
      personChanged ? 1 : 0,
      personChanged ? 1 : 0,
      needsResend ? 1 : 0,
      personChanged ? 1 : 0,
      current.id
    );
  }

  return getAssignmentsForWeek(env, sabhaWeekId);
}

function buildSendSummary(assignments) {
  const sentAssignments = assignments.filter((assignment) => assignment.sendCount > 0).length;
  const resendPending = assignments.filter((assignment) => assignment.needsResend).length;
  const resentAssignments = assignments.filter((assignment) => assignment.sendCount > 1).length;

  return {
    totalAssignments: assignments.length,
    sentAssignments,
    unsentAssignments: assignments.length - sentAssignments,
    resendPending,
    resentAssignments
  };
}

export async function getSabhaWeekById(env, id) {
  const week = await queryFirst(env, "SELECT * FROM sabha_weeks WHERE id = ?", id);
  if (!week) {
    return null;
  }

  const assignments = await getAssignmentsForWeek(env, id);
  const summary = await getSabhaSummaryByWeekId(env, id);
  return {
    id: week.id,
    sabhaDate: week.sabha_date,
    sabhaTime: week.sabha_time,
    notes: week.notes,
    status: week.status,
    assignments,
    summary: summary ? {
      ...summary,
      sendHistory: await getSabhaSummarySendHistory(env, id)
    } : null,
    sendSummary: buildSendSummary(assignments),
    createdAt: week.created_at,
    updatedAt: week.updated_at
  };
}

export async function getHistory(env) {
  const weeks = await queryAll(
    env,
    "SELECT * FROM sabha_weeks ORDER BY sabha_date DESC, sabha_time DESC, id DESC"
  );

  const history = [];
  for (const week of weeks) {
    history.push(await getSabhaWeekById(env, week.id));
  }
  return history;
}

export async function getLatestWeek(env) {
  const row = await queryFirst(
    env,
    "SELECT id FROM sabha_weeks ORDER BY sabha_date DESC, sabha_time DESC, id DESC LIMIT 1"
  );
  return row ? getSabhaWeekById(env, row.id) : null;
}

export async function getOverview(env) {
  const counts = await queryFirst(
    env,
    `SELECT
       (SELECT COUNT(*) FROM people WHERE active = 1) AS people_count,
       (SELECT COUNT(*) FROM people WHERE telegram_chat_id IS NOT NULL) AS linked_count,
       (SELECT COUNT(*) FROM assignments WHERE confirmed_at IS NULL AND declined_at IS NULL) AS unconfirmed_count`
  );

  return {
    peopleCount: counts?.people_count || 0,
    linkedCount: counts?.linked_count || 0,
    unconfirmedCount: counts?.unconfirmed_count || 0,
    coordinator: await getCoordinator(env),
    latestWeek: await getLatestWeek(env),
    nextWeekScheduled: Boolean(await findUpcomingSabha(env)),
    summaryChat: await getSummaryChat(env)
  };
}

export async function generateLinkToken(env, personId) {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
  await execute(env, "DELETE FROM link_tokens WHERE person_id = ?", personId);
  await execute(
    env,
    "INSERT INTO link_tokens (token, person_id, expires_at) VALUES (?, ?, ?)",
    token,
    personId,
    dayjs().add(14, "day").toISOString()
  );
  return { token, person: await getPersonById(env, personId) };
}

export async function consumeLinkToken(env, token, telegramChatId, telegramUsername) {
  const row = await queryFirst(
    env,
    "SELECT person_id, expires_at FROM link_tokens WHERE token = ?",
    token
  );
  if (!row) {
    return null;
  }

  if (row.expires_at && dayjs(row.expires_at).isBefore(dayjs())) {
    await execute(env, "DELETE FROM link_tokens WHERE token = ?", token);
    return null;
  }

  await execute(
    env,
    `UPDATE people
     SET telegram_chat_id = ?, telegram_username = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    String(telegramChatId),
    telegramUsername || null,
    row.person_id
  );
  await execute(env, "DELETE FROM link_tokens WHERE token = ?", token);
  return getPersonById(env, row.person_id);
}

export async function upsertPersonFromTelegram(env, input) {
  if (!ALLOWED_CENTERS.includes(input.center)) {
    throw new Error("Invalid center.");
  }

  const existing = await queryFirst(env, "SELECT id FROM people WHERE bkms_id = ?", input.bkmsId);
  if (existing) {
    await execute(
      env,
      `UPDATE people
       SET first_name = ?, last_name = ?, center = ?, telegram_chat_id = ?, telegram_username = ?,
           active = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.firstName,
      input.lastName,
      input.center,
      String(input.telegramChatId),
      input.telegramUsername || null,
      existing.id
    );
    return getPersonById(env, existing.id);
  }

  const result = await execute(
    env,
    `INSERT INTO people (
      first_name, last_name, bkms_id, center, telegram_chat_id, telegram_username, active, is_coordinator, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP)`,
    input.firstName,
    input.lastName,
    input.bkmsId,
    input.center,
    String(input.telegramChatId),
    input.telegramUsername || null
  );
  return getPersonById(env, Number(result.meta.last_row_id));
}

export async function logConfirmationEvent(env, assignmentId, eventType, eventText) {
  await execute(
    env,
    "INSERT INTO confirmation_events (assignment_id, event_type, event_text) VALUES (?, ?, ?)",
    assignmentId,
    eventType,
    eventText
  );
}

export async function markAssignmentSent(env, assignmentId, telegramMessageId) {
  await execute(
    env,
    `UPDATE assignments
     SET sent_at = CURRENT_TIMESTAMP,
         send_count = send_count + 1,
         needs_resend = 0,
         follow_up_sent_at = NULL,
         telegram_message_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    String(telegramMessageId),
    assignmentId
  );
  return getAssignmentById(env, assignmentId);
}

export async function markFollowUpSent(env, assignmentId) {
  await execute(
    env,
    "UPDATE assignments SET follow_up_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    assignmentId
  );
  return getAssignmentById(env, assignmentId);
}

export async function confirmAssignment(env, assignmentId) {
  const assignment = await getAssignmentById(env, assignmentId);
  if (!assignment) {
    return { assignment: null, alreadyConfirmed: false };
  }
  if (assignment.confirmedAt) {
    return { assignment, alreadyConfirmed: true };
  }
  await execute(
    env,
    `UPDATE assignments
     SET confirmed_at = CURRENT_TIMESTAMP,
         declined_at = NULL,
         decline_reason = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    assignmentId
  );
  return { assignment: await getAssignmentById(env, assignmentId), alreadyConfirmed: false };
}

export async function declineAssignment(env, assignmentId, declineReason) {
  const assignment = await getAssignmentById(env, assignmentId);
  if (!assignment) {
    return { assignment: null, alreadyDeclined: false };
  }
  if (assignment.declinedAt) {
    return { assignment, alreadyDeclined: true };
  }
  await execute(
    env,
    `UPDATE assignments
     SET declined_at = CURRENT_TIMESTAMP,
         confirmed_at = NULL,
         decline_reason = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    declineReason,
    assignmentId
  );
  return { assignment: await getAssignmentById(env, assignmentId), alreadyDeclined: false };
}

export async function buildAssignmentMessage(env, assignment, sabhaWeek) {
  const timezone = env.TIMEZONE || "America/Los_Angeles";
  return renderTemplate(assignment.customMessage || assignment.templateText || "", {
    firstName: assignment.firstName,
    lastName: assignment.lastName,
    role: assignment.roleName,
    date: formatSabhaDate(sabhaWeek.sabhaDate, timezone),
    time: formatSabhaTime(sabhaWeek.sabhaDate, sabhaWeek.sabhaTime, timezone)
  });
}

export async function buildAssignmentFollowUpMessage(env, assignment, sabhaWeek) {
  return `Jay Swaminarayan ${assignment.firstName}, just following up about your ${assignment.roleName} for Kishore Sabha on ${formatSabhaDate(
    sabhaWeek.sabhaDate,
    env.TIMEZONE || "America/Los_Angeles"
  )}. Please tap Confirm if you can do it, or Can't do it if you need help.`;
}

export async function getNotificationAssignments(env, sabhaWeekId, assignmentIds = null) {
  const sabhaWeek = await getSabhaWeekById(env, sabhaWeekId);
  if (!sabhaWeek) {
    throw new Error("Sabha week not found.");
  }
  const allAssignments = sabhaWeek.assignments;
  const filtered = assignmentIds?.length
    ? allAssignments.filter((item) => assignmentIds.includes(item.id))
    : allAssignments.filter((item) => (!item.sentAt || item.needsResend) && item.personId);

  if (!filtered.length) {
    throw new Error("There are no new or changed member assignments to send.");
  }

  const assignments = [];
  for (const assignment of filtered) {
    assignments.push({
      ...assignment,
      messageText: await buildAssignmentMessage(env, assignment, sabhaWeek)
    });
  }

  return { sabhaWeek, assignments };
}

export async function getPendingFollowUpAssignments(env, now = dayjs()) {
  const assignments = (await queryAll(
    env,
    `SELECT
      a.id AS assignment_id,
      a.*,
      r.name AS role_name,
      p.first_name,
      p.last_name,
      p.bkms_id,
      p.telegram_chat_id,
      mt.template_text
     FROM assignments a
     JOIN roles r ON r.id = a.role_id
     JOIN people p ON p.id = a.person_id
     LEFT JOIN message_templates mt ON mt.role_id = a.role_id
     WHERE a.sent_at IS NOT NULL
       AND a.confirmed_at IS NULL
       AND a.declined_at IS NULL
       AND a.follow_up_sent_at IS NULL
       AND p.telegram_chat_id IS NOT NULL`
  )).map(mapAssignment);

  return assignments.filter((assignment) =>
    isSameOrPast(dayjs(assignment.sentAt).add(24, "hour"), now)
  );
}

export async function findUpcomingSabha(env, now = dayjs()) {
  const timezone = env.TIMEZONE || "America/Los_Angeles";
  const weeks = await queryAll(
    env,
    "SELECT * FROM sabha_weeks WHERE status != 'completed' ORDER BY sabha_date ASC, sabha_time ASC"
  );
  const upcoming = weeks.find((week) => isFutureSabha(week.sabha_date, week.sabha_time, timezone, now));
  return upcoming ? getSabhaWeekById(env, upcoming.id) : null;
}

export async function getReminderSnapshot(env, now = dayjs()) {
  return {
    shouldRemind: !(await findUpcomingSabha(env, now)),
    coordinator: await getCoordinator(env),
    upcomingSabha: await findUpcomingSabha(env, now)
  };
}

export async function upsertTelegramChat(env, chat) {
  await execute(
    env,
    `INSERT INTO telegram_chats (chat_id, chat_type, title, username, is_summary_target, updated_at)
     VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT(chat_id) DO UPDATE SET
       chat_type = excluded.chat_type,
       title = excluded.title,
       username = excluded.username,
       updated_at = CURRENT_TIMESTAMP`,
    String(chat.id),
    chat.type,
    chat.title || null,
    chat.username || null
  );
}

export async function getSummaryChat(env) {
  const row = await queryFirst(
    env,
    `SELECT chat_id, chat_type, title, username, is_summary_target, created_at, updated_at
     FROM telegram_chats
     WHERE is_summary_target = 1
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    chatType: row.chat_type,
    title: row.title,
    username: row.username,
    isSummaryTarget: Boolean(row.is_summary_target),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function setSummaryChatTarget(env, chat) {
  await execute(env, "UPDATE telegram_chats SET is_summary_target = 0");
  await execute(
    env,
    `INSERT INTO telegram_chats (chat_id, chat_type, title, username, is_summary_target, updated_at)
     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(chat_id) DO UPDATE SET
       chat_type = excluded.chat_type,
       title = excluded.title,
       username = excluded.username,
       is_summary_target = 1,
       updated_at = CURRENT_TIMESTAMP`,
    String(chat.id),
    chat.type,
    chat.title || null,
    chat.username || null
  );

  return getSummaryChat(env);
}

export async function getBotSession(env, chatId) {
  const row = await queryFirst(env, "SELECT * FROM bot_sessions WHERE chat_id = ?", String(chatId));
  if (!row) {
    return null;
  }
  return {
    chatId: row.chat_id,
    state: row.state,
    payload: row.payload ? JSON.parse(row.payload) : {}
  };
}

export async function saveBotSession(env, chatId, state, payload = {}) {
  await execute(
    env,
    `INSERT INTO bot_sessions (chat_id, state, payload, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(chat_id) DO UPDATE SET
       state = excluded.state,
       payload = excluded.payload,
       updated_at = CURRENT_TIMESTAMP`,
    String(chatId),
    state,
    JSON.stringify(payload)
  );
}

export async function clearBotSession(env, chatId) {
  await execute(env, "DELETE FROM bot_sessions WHERE chat_id = ?", String(chatId));
}

export async function getSetting(env, key) {
  const row = await queryFirst(env, "SELECT value FROM app_settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(env, key, value) {
  await execute(
    env,
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    key,
    value
  );
}

export function buildDefaultSummaryMessage(sabhaWeek, env) {
  return `Jai Swaminaryan! In this weeks sabha (${formatSabhaDate(sabhaWeek.sabhaDate, env.TIMEZONE || "America/Los_Angeles")}) we learned:`;
}

export async function getSabhaSummarySendHistory(env, sabhaWeekId) {
  return (await queryAll(
    env,
    `SELECT *
     FROM sabha_summary_sends
     WHERE sabha_week_id = ?
     ORDER BY sent_at DESC, id DESC`,
    sabhaWeekId
  )).map(mapSummarySend);
}

export async function getSabhaSummaryByWeekId(env, sabhaWeekId) {
  return mapSummary(await queryFirst(
    env,
    "SELECT * FROM sabha_summaries WHERE sabha_week_id = ?",
    sabhaWeekId
  ));
}

export async function upsertSabhaSummary(env, sabhaWeekId, input) {
  const existing = await getSabhaSummaryByWeekId(env, sabhaWeekId);
  const sabhaWeek = await getSabhaWeekById(env, sabhaWeekId);
  const messageText = String(input.messageText || "").trim() || buildDefaultSummaryMessage(sabhaWeek, env);

  if (existing) {
    await execute(
      env,
      `UPDATE sabha_summaries
       SET message_text = ?, updated_at = CURRENT_TIMESTAMP
       WHERE sabha_week_id = ?`,
      messageText,
      sabhaWeekId
    );
  } else {
    await execute(
      env,
      "INSERT INTO sabha_summaries (sabha_week_id, message_text) VALUES (?, ?)",
      sabhaWeekId,
      messageText
    );
  }

  return getSabhaSummaryByWeekId(env, sabhaWeekId);
}

export async function markSabhaSummarySent(env, sabhaWeekId, telegramMessageId) {
  const summary = await getSabhaSummaryByWeekId(env, sabhaWeekId);

  await execute(
    env,
    `UPDATE sabha_summaries
     SET sent_at = CURRENT_TIMESTAMP,
         send_count = send_count + 1,
         telegram_message_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE sabha_week_id = ?`,
    String(telegramMessageId),
    sabhaWeekId
  );

  if (summary) {
    await execute(
      env,
      `INSERT INTO sabha_summary_sends (sabha_week_id, message_text, telegram_message_id)
       VALUES (?, ?, ?)`,
      sabhaWeekId,
      summary.messageText,
      String(telegramMessageId)
    );
  }

  return getSabhaSummaryByWeekId(env, sabhaWeekId);
}
