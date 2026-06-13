const { nanoid } = require("nanoid");
const { db } = require("./db");
const { timezone } = require("./config");
const { renderTemplate, formatSabhaDate, combineSabhaDateTime, dayjs } = require("./helpers");

const ALLOWED_CENTERS = ["San Francisco", "San Jose", "Sacramento"];

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
    linkToken: row.link_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAssignment(row) {
  return {
    id: row.assignment_id,
    sabhaWeekId: row.sabha_week_id,
    roleId: row.role_id,
    roleName: row.role_name,
    personId: row.person_id,
    personName: `${row.first_name} ${row.last_name}`,
    firstName: row.first_name,
    lastName: row.last_name,
    bkmsId: row.bkms_id,
    telegramChatId: row.telegram_chat_id,
    uploadId: row.upload_id,
    uploadName: row.original_name,
    uploadPath: row.file_path,
    uploadMimeType: row.mime_type,
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
    uploadId: row.upload_id,
    uploadName: row.original_name,
    uploadPath: row.file_path,
    uploadMimeType: row.mime_type,
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
    uploadId: row.upload_id,
    uploadName: row.original_name,
    messageText: row.message_text,
    telegramMessageId: row.telegram_message_id,
    sentAt: row.sent_at
  };
}

function mapReport(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sabhaWeekId: row.sabha_week_id,
    fileName: row.file_name,
    filePath: row.file_path,
    createdAt: row.created_at
  };
}

function mapReportSend(row) {
  return {
    id: row.id,
    sabhaReportId: row.sabha_report_id,
    personId: row.person_id,
    personName: `${row.first_name} ${row.last_name}`,
    telegramMessageId: row.telegram_message_id,
    sentAt: row.sent_at
  };
}

function getPeople() {
  return db
    .prepare("SELECT * FROM people ORDER BY first_name, last_name")
    .all()
    .map(mapPerson);
}

function upsertTelegramChat(chat) {
  db.prepare(`
    INSERT INTO telegram_chats (chat_id, chat_type, title, username, is_summary_target, updated_at)
    VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
      chat_type = excluded.chat_type,
      title = excluded.title,
      username = excluded.username,
      updated_at = CURRENT_TIMESTAMP
  `).run(String(chat.id), chat.type, chat.title || null, chat.username || null);
}

function getTelegramChats() {
  return db.prepare(`
    SELECT chat_id, chat_type, title, username, is_summary_target, created_at, updated_at
    FROM telegram_chats
    ORDER BY title, chat_id
  `).all().map((row) => ({
    chatId: row.chat_id,
    chatType: row.chat_type,
    title: row.title,
    username: row.username,
    isSummaryTarget: Boolean(row.is_summary_target),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getSummaryChat() {
  const row = db.prepare(`
    SELECT chat_id, chat_type, title, username, is_summary_target, created_at, updated_at
    FROM telegram_chats
    WHERE is_summary_target = 1
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();

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

function setSummaryChatTarget(chat) {
  const txn = db.transaction((chatToSave) => {
    db.prepare("UPDATE telegram_chats SET is_summary_target = 0").run();
    db.prepare(`
      INSERT INTO telegram_chats (chat_id, chat_type, title, username, is_summary_target, updated_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id) DO UPDATE SET
        chat_type = excluded.chat_type,
        title = excluded.title,
        username = excluded.username,
        is_summary_target = 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(String(chatToSave.id), chatToSave.type, chatToSave.title || null, chatToSave.username || null);
  });

  txn(chat);
  return getSummaryChat();
}

function createPerson(input) {
  const telegramChatId = input.telegramChatId ? String(input.telegramChatId).trim() : null;

  if (input.isCoordinator) {
    db.prepare("UPDATE people SET is_coordinator = 0").run();
  }

  const existing = db.prepare("SELECT id FROM people WHERE bkms_id = ?").get(input.bkmsId);
  if (existing) {
    return updatePerson(existing.id, input);
  }

  const result = db.prepare(`
    INSERT INTO people (first_name, last_name, bkms_id, center, telegram_chat_id, active, is_coordinator)
    VALUES (@firstName, @lastName, @bkmsId, @center, @telegramChatId, @active, @isCoordinator)
  `).run({
    firstName: input.firstName,
    lastName: input.lastName,
    bkmsId: input.bkmsId,
    center: input.center,
    telegramChatId,
    active: input.active ? 1 : 0,
    isCoordinator: input.isCoordinator ? 1 : 0
  });

  return getPersonById(result.lastInsertRowid);
}

function updatePerson(id, input) {
  const telegramChatId = input.telegramChatId ? String(input.telegramChatId).trim() : null;

  if (input.isCoordinator) {
    db.prepare("UPDATE people SET is_coordinator = 0").run();
  }

  db.prepare(`
    UPDATE people
    SET first_name = @firstName,
        last_name = @lastName,
        bkms_id = @bkmsId,
        center = @center,
        telegram_chat_id = @telegramChatId,
        telegram_username = CASE
          WHEN @telegramChatId IS NULL THEN NULL
          ELSE telegram_username
        END,
        active = @active,
        is_coordinator = @isCoordinator,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id,
    firstName: input.firstName,
    lastName: input.lastName,
    bkmsId: input.bkmsId,
    center: input.center,
    telegramChatId,
    active: input.active ? 1 : 0,
    isCoordinator: input.isCoordinator ? 1 : 0
  });

  return getPersonById(id);
}

function getPersonById(id) {
  const row = db.prepare("SELECT * FROM people WHERE id = ?").get(id);
  return mapPerson(row);
}

function getCoordinator() {
  return mapPerson(db.prepare("SELECT * FROM people WHERE is_coordinator = 1 LIMIT 1").get());
}

function getPersonByTelegramChatId(chatId) {
  return mapPerson(db.prepare("SELECT * FROM people WHERE telegram_chat_id = ? LIMIT 1").get(String(chatId)));
}

function deletePerson(personId) {
  const removePerson = db.transaction((id) => {
    const assignmentIds = db.prepare("SELECT id FROM assignments WHERE person_id = ?").all(id).map((row) => row.id);
    if (assignmentIds.length > 0) {
      const deleteEvents = db.prepare(`DELETE FROM confirmation_events WHERE assignment_id = ?`);
      assignmentIds.forEach((assignmentId) => deleteEvents.run(assignmentId));
    }

    db.prepare("DELETE FROM assignments WHERE person_id = ?").run(id);
    db.prepare("DELETE FROM people WHERE id = ?").run(id);
  });

  removePerson(personId);
}

function generateLinkToken(personId) {
  const token = nanoid(18);
  db.prepare("UPDATE people SET link_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, personId);
  return { token, person: getPersonById(personId) };
}

function consumeLinkToken(token, telegramChatId, telegramUsername) {
  const row = db.prepare("SELECT * FROM people WHERE link_token = ?").get(token);
  if (!row) {
    return null;
  }

  db.prepare(`
    UPDATE people
    SET telegram_chat_id = ?,
        telegram_username = ?,
        link_token = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(String(telegramChatId), telegramUsername || null, row.id);

  return getPersonById(row.id);
}

function upsertPersonFromTelegram(input) {
  if (!ALLOWED_CENTERS.includes(input.center)) {
    throw new Error("Invalid center.");
  }

  const existing = db.prepare("SELECT id FROM people WHERE bkms_id = ?").get(input.bkmsId);
  if (existing) {
    db.prepare(`
      UPDATE people
      SET first_name = @firstName,
          last_name = @lastName,
          center = @center,
          telegram_chat_id = @telegramChatId,
          telegram_username = @telegramUsername,
          active = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id: existing.id,
      firstName: input.firstName,
      lastName: input.lastName,
      center: input.center,
      telegramChatId: String(input.telegramChatId),
      telegramUsername: input.telegramUsername || null
    });

    return getPersonById(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO people (
      first_name,
      last_name,
      bkms_id,
      center,
      telegram_chat_id,
      telegram_username,
      active,
      is_coordinator
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0)
  `).run(
    input.firstName,
    input.lastName,
    input.bkmsId,
    input.center,
    String(input.telegramChatId),
    input.telegramUsername || null
  );

  return getPersonById(result.lastInsertRowid);
}

function getRoles() {
  return db.prepare("SELECT id, name FROM roles WHERE active = 1 ORDER BY id").all();
}

function getTemplates() {
  return db.prepare(`
    SELECT mt.id, mt.template_text, mt.updated_at, r.id AS role_id, r.name AS role_name
    FROM message_templates mt
    JOIN roles r ON r.id = mt.role_id
    ORDER BY r.id
  `).all().map((row) => ({
    id: row.id,
    roleId: row.role_id,
    roleName: row.role_name,
    templateText: row.template_text,
    updatedAt: row.updated_at
  }));
}

function updateTemplate(roleId, templateText) {
  db.prepare(`
    UPDATE message_templates
    SET template_text = ?, updated_at = CURRENT_TIMESTAMP
    WHERE role_id = ?
  `).run(templateText, roleId);

  return getTemplates();
}

function createSabhaWeek(input) {
  const result = db.prepare(`
    INSERT INTO sabha_weeks (sabha_date, sabha_time, notes, status)
    VALUES (@sabhaDate, @sabhaTime, @notes, @status)
  `).run({
    sabhaDate: input.sabhaDate,
    sabhaTime: input.sabhaTime,
    notes: input.notes || "",
    status: input.status || "scheduled"
  });

  return getSabhaWeekById(result.lastInsertRowid);
}

function updateSabhaWeek(id, input) {
  db.prepare(`
    UPDATE sabha_weeks
    SET sabha_date = @sabhaDate,
        sabha_time = @sabhaTime,
        notes = @notes,
        status = @status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id,
    sabhaDate: input.sabhaDate,
    sabhaTime: input.sabhaTime,
    notes: input.notes || "",
    status: input.status || "scheduled"
  });

  return getSabhaWeekById(id);
}

function getSabhaWeekById(id) {
  const week = db.prepare("SELECT * FROM sabha_weeks WHERE id = ?").get(id);
  if (!week) {
    return null;
  }

  const assignments = getAssignmentsForWeek(week.id);
  const summary = getSabhaSummaryByWeekId(week.id);

  return {
    id: week.id,
    sabhaDate: week.sabha_date,
    sabhaTime: week.sabha_time,
    notes: week.notes,
    status: week.status,
    createdAt: week.created_at,
    updatedAt: week.updated_at,
    assignments,
    sendSummary: buildSendSummary(assignments),
    summary: summary ? { ...summary, sendHistory: getSabhaSummarySendHistory(week.id) } : null,
    latestReport: getLatestReportByWeekId(week.id)
  };
}

function getCurrentAndFutureWeeks() {
  return db.prepare(`
    SELECT *
    FROM sabha_weeks
    ORDER BY sabha_date DESC, sabha_time DESC
  `).all().map((row) => ({
    id: row.id,
    sabhaDate: row.sabha_date,
    sabhaTime: row.sabha_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getLatestWeek() {
  const row = db.prepare(`
    SELECT *
    FROM sabha_weeks
    ORDER BY sabha_date DESC, sabha_time DESC
    LIMIT 1
  `).get();

  return row ? getSabhaWeekById(row.id) : null;
}

function getHistory() {
  return db.prepare(`
    SELECT *
    FROM sabha_weeks
    ORDER BY sabha_date DESC, sabha_time DESC
  `).all().map((row) => getSabhaWeekById(row.id));
}

function deleteSabhaWeek(id) {
  db.prepare("DELETE FROM sabha_weeks WHERE id = ?").run(id);
}

function upsertAssignments(sabhaWeekId, assignments) {
  const deleteMissing = db.prepare(`
    DELETE FROM assignments
    WHERE sabha_week_id = ?
      AND role_id = ?
  `);

  const insert = db.prepare(`
    INSERT INTO assignments (sabha_week_id, role_id, person_id, upload_id, custom_message)
    VALUES (@sabhaWeekId, @roleId, @personId, @uploadId, @customMessage)
    ON CONFLICT(sabha_week_id, role_id) DO UPDATE SET
      person_id = excluded.person_id,
      upload_id = excluded.upload_id,
      custom_message = excluded.custom_message,
      confirmed_at = CASE
        WHEN assignments.person_id != excluded.person_id THEN NULL
        ELSE assignments.confirmed_at
      END,
      declined_at = CASE
        WHEN assignments.person_id != excluded.person_id THEN NULL
        ELSE assignments.declined_at
      END,
      decline_reason = CASE
        WHEN assignments.person_id != excluded.person_id THEN NULL
        ELSE assignments.decline_reason
      END,
      follow_up_sent_at = CASE
        WHEN assignments.person_id != excluded.person_id
          OR IFNULL(assignments.upload_id, 0) != IFNULL(excluded.upload_id, 0)
          OR IFNULL(assignments.custom_message, '') != IFNULL(excluded.custom_message, '')
        THEN NULL
        ELSE assignments.follow_up_sent_at
      END,
      sent_at = CASE
        WHEN assignments.person_id != excluded.person_id THEN NULL
        ELSE assignments.sent_at
      END,
      send_count = CASE
        WHEN assignments.person_id != excluded.person_id THEN 0
        ELSE assignments.send_count
      END,
      needs_resend = CASE
        WHEN assignments.sent_at IS NULL THEN 0
        WHEN assignments.person_id != excluded.person_id
          OR IFNULL(assignments.upload_id, 0) != IFNULL(excluded.upload_id, 0)
          OR IFNULL(assignments.custom_message, '') != IFNULL(excluded.custom_message, '')
        THEN 1
        ELSE assignments.needs_resend
      END,
      telegram_message_id = CASE
        WHEN assignments.person_id != excluded.person_id THEN NULL
        ELSE assignments.telegram_message_id
      END,
      updated_at = CURRENT_TIMESTAMP
  `);

  const txn = db.transaction((items) => {
    const existingRoleIds = db.prepare("SELECT role_id FROM assignments WHERE sabha_week_id = ?").all(sabhaWeekId).map((row) => row.role_id);
    const incomingRoleIds = new Set(items.map((item) => item.roleId));

    existingRoleIds
      .filter((roleId) => !incomingRoleIds.has(roleId))
      .forEach((roleId) => deleteMissing.run(sabhaWeekId, roleId));

    items.forEach((item) => {
      insert.run({
        sabhaWeekId,
        roleId: item.roleId,
        personId: item.personId,
        uploadId: item.uploadId || null,
        customMessage: item.customMessage || null
      });
    });
  });

  txn(assignments);
  return getAssignmentsForWeek(sabhaWeekId);
}

function getAssignmentsForWeek(sabhaWeekId) {
  return db.prepare(`
    SELECT
      a.id AS assignment_id,
      a.*,
      r.name AS role_name,
      p.first_name,
      p.last_name,
      p.bkms_id,
      p.telegram_chat_id,
      u.original_name,
      u.file_path,
      u.mime_type,
      mt.template_text
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    JOIN people p ON p.id = a.person_id
    LEFT JOIN uploads u ON u.id = a.upload_id
    LEFT JOIN message_templates mt ON mt.role_id = a.role_id
    WHERE a.sabha_week_id = ?
    ORDER BY a.role_id
  `).all(sabhaWeekId).map(mapAssignment);
}

function getAssignmentById(id) {
  const row = db.prepare(`
    SELECT
      a.id AS assignment_id,
      a.*,
      r.name AS role_name,
      p.first_name,
      p.last_name,
      p.bkms_id,
      p.telegram_chat_id,
      u.original_name,
      u.file_path,
      u.mime_type,
      mt.template_text
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    JOIN people p ON p.id = a.person_id
    LEFT JOIN uploads u ON u.id = a.upload_id
    LEFT JOIN message_templates mt ON mt.role_id = a.role_id
    WHERE a.id = ?
  `).get(id);

  return row ? mapAssignment(row) : null;
}

function addUpload(file) {
  const result = db.prepare(`
    INSERT INTO uploads (original_name, stored_name, file_path, mime_type)
    VALUES (?, ?, ?, ?)
  `).run(file.originalname, file.filename, file.path, file.mimetype || null);

  return getUploadById(result.lastInsertRowid);
}

function getUploads() {
  return db.prepare(`
    SELECT *
    FROM uploads
    ORDER BY created_at DESC, id DESC
  `).all();
}

function getUploadById(id) {
  return db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
}

function buildDefaultSummaryMessage(sabhaWeek) {
  return `Jai Swaminaryan! In this weeks sabha (${formatSabhaDate(sabhaWeek.sabhaDate, timezone)}) we learned:`;
}

function buildAssignmentMessage(assignment, sabhaWeek) {
  const template = assignment.customMessage || assignment.templateText || "";
  const message = renderTemplate(template, {
    firstName: assignment.firstName,
    lastName: assignment.lastName,
    role: assignment.roleName,
    date: formatSabhaDate(sabhaWeek.sabhaDate, timezone),
    time: dayjs.tz(`${sabhaWeek.sabhaDate}T${sabhaWeek.sabhaTime}`, timezone).format("h:mm A"),
    center: "",
    bkmsId: ""
  });

  return message;
}

function buildAssignmentFollowUpMessage(assignment, sabhaWeek) {
  return `Jay Swaminarayan ${assignment.firstName}, just following up about your ${assignment.roleName} for Kishore Sabha on ${formatSabhaDate(
    sabhaWeek.sabhaDate,
    timezone
  )}. Please tap Confirm if you can do it, or Can't do it if you need help.`;
}

function markAssignmentSent(assignmentId, telegramMessageId) {
  db.prepare(`
    UPDATE assignments
    SET sent_at = CURRENT_TIMESTAMP,
        send_count = send_count + 1,
        needs_resend = 0,
        follow_up_sent_at = NULL,
        telegram_message_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(String(telegramMessageId), assignmentId);

  return getAssignmentById(assignmentId);
}

function confirmAssignment(assignmentId) {
  const assignment = getAssignmentById(assignmentId);
  if (!assignment) {
    return { assignment: null, alreadyConfirmed: false };
  }

  if (assignment.confirmedAt) {
    return { assignment, alreadyConfirmed: true };
  }

  db.prepare(`
    UPDATE assignments
    SET confirmed_at = CURRENT_TIMESTAMP,
        declined_at = NULL,
        decline_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(assignmentId);

  return { assignment: getAssignmentById(assignmentId), alreadyConfirmed: false };
}

function declineAssignment(assignmentId, declineReason) {
  const assignment = getAssignmentById(assignmentId);
  if (!assignment) {
    return { assignment: null, alreadyDeclined: false };
  }

  if (assignment.declinedAt) {
    return { assignment, alreadyDeclined: true };
  }

  db.prepare(`
    UPDATE assignments
    SET declined_at = CURRENT_TIMESTAMP,
        confirmed_at = NULL,
        decline_reason = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(declineReason, assignmentId);

  return { assignment: getAssignmentById(assignmentId), alreadyDeclined: false };
}

function logConfirmationEvent(assignmentId, eventType, eventText) {
  db.prepare(`
    INSERT INTO confirmation_events (assignment_id, event_type, event_text)
    VALUES (?, ?, ?)
  `).run(assignmentId, eventType, eventText);
}

function getOverview() {
  const peopleCount = db.prepare("SELECT COUNT(*) AS count FROM people WHERE active = 1").get().count;
  const linkedCount = db.prepare("SELECT COUNT(*) AS count FROM people WHERE telegram_chat_id IS NOT NULL").get().count;
  const coordinator = getCoordinator();
  const latestWeek = getLatestWeek();
  const summaryChat = getSummaryChat();
  const unconfirmedCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM assignments
    WHERE confirmed_at IS NULL AND declined_at IS NULL
  `).get().count;

  return {
    peopleCount,
    linkedCount,
    coordinator,
    latestWeek,
    summaryChat,
    unconfirmedCount,
    nextWeekScheduled: Boolean(findUpcomingSabha())
  };
}

function markFollowUpSent(assignmentId) {
  db.prepare(`
    UPDATE assignments
    SET follow_up_sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(assignmentId);

  return getAssignmentById(assignmentId);
}

function getPendingFollowUpAssignments(now = dayjs()) {
  const rows = db.prepare(`
    SELECT
      a.id AS assignment_id,
      a.*,
      r.name AS role_name,
      p.first_name,
      p.last_name,
      p.bkms_id,
      p.telegram_chat_id,
      u.original_name,
      u.file_path,
      u.mime_type,
      mt.template_text
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    JOIN people p ON p.id = a.person_id
    LEFT JOIN uploads u ON u.id = a.upload_id
    LEFT JOIN message_templates mt ON mt.role_id = a.role_id
    WHERE a.sent_at IS NOT NULL
      AND a.confirmed_at IS NULL
      AND a.declined_at IS NULL
      AND a.follow_up_sent_at IS NULL
      AND p.telegram_chat_id IS NOT NULL
  `).all();

  return rows
    .map(mapAssignment)
    .filter((assignment) => dayjs.utc(assignment.sentAt).add(24, "hour").isSame(now) || dayjs.utc(assignment.sentAt).add(24, "hour").isBefore(now));
}

function findUpcomingSabha(now = dayjs()) {
  const weeks = db.prepare(`
    SELECT *
    FROM sabha_weeks
    WHERE status != 'completed'
    ORDER BY sabha_date ASC, sabha_time ASC
  `).all();

  return weeks.find((week) => combineSabhaDateTime(week.sabha_date, week.sabha_time, timezone).isAfter(now)) || null;
}

function shouldSendCoordinatorReminder(now = dayjs()) {
  return !findUpcomingSabha(now);
}

function getReminderSnapshot(now = dayjs()) {
  return {
    shouldRemind: shouldSendCoordinatorReminder(now),
    coordinator: getCoordinator(),
    upcomingSabha: findUpcomingSabha(now)
  };
}

function getNotificationAssignments(sabhaWeekId, assignmentIds) {
  const sabhaWeek = getSabhaWeekById(sabhaWeekId);
  const allAssignments = getAssignmentsForWeek(sabhaWeekId);
  const filtered = assignmentIds?.length
    ? allAssignments.filter((item) => assignmentIds.includes(item.id))
    : allAssignments.filter((item) => !item.sentAt || item.needsResend);

  if (filtered.length === 0) {
    throw new Error("There are no new or changed assignments to send.");
  }

  return {
    sabhaWeek,
    assignments: filtered.map((assignment) => ({
      ...assignment,
      messageText: buildAssignmentMessage(assignment, sabhaWeek)
    }))
  };
}

function getSabhaSummaryByWeekId(sabhaWeekId) {
  const row = db.prepare(`
    SELECT ss.*, u.original_name, u.file_path, u.mime_type
    FROM sabha_summaries ss
    LEFT JOIN uploads u ON u.id = ss.upload_id
    WHERE ss.sabha_week_id = ?
  `).get(sabhaWeekId);

  return mapSummary(row);
}

function getSabhaSummarySendHistory(sabhaWeekId) {
  return db.prepare(`
    SELECT sss.*, u.original_name, u.mime_type
    FROM sabha_summary_sends sss
    LEFT JOIN uploads u ON u.id = sss.upload_id
    WHERE sss.sabha_week_id = ?
    ORDER BY sss.sent_at DESC, sss.id DESC
  `).all(sabhaWeekId).map(mapSummarySend);
}

function upsertSabhaSummary(sabhaWeekId, input) {
  const existing = getSabhaSummaryByWeekId(sabhaWeekId);
  const sabhaWeek = getSabhaWeekById(sabhaWeekId);
  const messageText = input.messageText?.trim() || buildDefaultSummaryMessage(sabhaWeek);

  if (existing) {
    db.prepare(`
      UPDATE sabha_summaries
      SET upload_id = ?,
          message_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE sabha_week_id = ?
    `).run(input.uploadId || null, messageText, sabhaWeekId);
  } else {
    db.prepare(`
      INSERT INTO sabha_summaries (sabha_week_id, upload_id, message_text)
      VALUES (?, ?, ?)
    `).run(sabhaWeekId, input.uploadId || null, messageText);
  }

  return getSabhaSummaryByWeekId(sabhaWeekId);
}

function markSabhaSummarySent(sabhaWeekId, telegramMessageId) {
  const summary = getSabhaSummaryByWeekId(sabhaWeekId);

  db.prepare(`
    UPDATE sabha_summaries
    SET sent_at = CURRENT_TIMESTAMP,
        send_count = send_count + 1,
        telegram_message_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE sabha_week_id = ?
  `).run(String(telegramMessageId), sabhaWeekId);

  if (summary) {
    db.prepare(`
      INSERT INTO sabha_summary_sends (sabha_week_id, upload_id, message_text, telegram_message_id)
      VALUES (?, ?, ?, ?)
    `).run(sabhaWeekId, summary.uploadId || null, summary.messageText, String(telegramMessageId));
  }

  return getSabhaSummaryByWeekId(sabhaWeekId);
}

function createSabhaReportRecord(sabhaWeekId, fileName, filePath) {
  const result = db.prepare(`
    INSERT INTO sabha_reports (sabha_week_id, file_name, file_path)
    VALUES (?, ?, ?)
  `).run(sabhaWeekId, fileName, filePath);

  return getSabhaReportById(result.lastInsertRowid);
}

function getSabhaReportById(reportId) {
  const row = db.prepare(`
    SELECT *
    FROM sabha_reports
    WHERE id = ?
  `).get(reportId);

  return mapReport(row);
}

function getLatestReportByWeekId(sabhaWeekId) {
  const row = db.prepare(`
    SELECT *
    FROM sabha_reports
    WHERE sabha_week_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(sabhaWeekId);

  const report = mapReport(row);
  if (!report) {
    return null;
  }

  return {
    ...report,
    sendHistory: getSabhaReportSendHistory(report.id)
  };
}

function getSabhaReportSendHistory(reportId) {
  if (!reportId) {
    return [];
  }

  return db.prepare(`
    SELECT srs.*, p.first_name, p.last_name
    FROM sabha_report_sends srs
    JOIN people p ON p.id = srs.person_id
    WHERE srs.sabha_report_id = ?
    ORDER BY srs.sent_at DESC, srs.id DESC
  `).all(reportId).map(mapReportSend);
}

function logSabhaReportSent(reportId, personId, telegramMessageId) {
  db.prepare(`
    INSERT INTO sabha_report_sends (sabha_report_id, person_id, telegram_message_id)
    VALUES (?, ?, ?)
  `).run(reportId, personId, String(telegramMessageId));
}

function getPersonMessageTarget(personId) {
  return getPersonById(personId);
}

function getBotSession(chatId) {
  const row = db.prepare("SELECT * FROM bot_sessions WHERE chat_id = ?").get(String(chatId));
  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    state: row.state,
    payload: row.payload ? JSON.parse(row.payload) : {}
  };
}

function saveBotSession(chatId, state, payload = {}) {
  db.prepare(`
    INSERT INTO bot_sessions (chat_id, state, payload, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
      state = excluded.state,
      payload = excluded.payload,
      updated_at = CURRENT_TIMESTAMP
  `).run(String(chatId), state, JSON.stringify(payload));
}

function clearBotSession(chatId) {
  db.prepare("DELETE FROM bot_sessions WHERE chat_id = ?").run(String(chatId));
}

function getSetupStatus() {
  return {
    hasCoordinator: Boolean(getCoordinator()),
    hasPeople: getPeople().length > 0,
    summaryChat: getSummaryChat()
  };
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

module.exports = {
  getPeople,
  createPerson,
  updatePerson,
  getPersonById,
  getCoordinator,
  getPersonByTelegramChatId,
  deletePerson,
  upsertTelegramChat,
  getTelegramChats,
  getSummaryChat,
  setSummaryChatTarget,
  generateLinkToken,
  consumeLinkToken,
  upsertPersonFromTelegram,
  getRoles,
  getTemplates,
  updateTemplate,
  createSabhaWeek,
  updateSabhaWeek,
  getSabhaWeekById,
  getCurrentAndFutureWeeks,
  getLatestWeek,
  getHistory,
  deleteSabhaWeek,
  upsertAssignments,
  getAssignmentsForWeek,
  getAssignmentById,
  addUpload,
  getUploads,
  getUploadById,
  buildAssignmentMessage,
  buildAssignmentFollowUpMessage,
  buildDefaultSummaryMessage,
  markAssignmentSent,
  markFollowUpSent,
  getSabhaSummaryByWeekId,
  getSabhaSummarySendHistory,
  upsertSabhaSummary,
  markSabhaSummarySent,
  createSabhaReportRecord,
  getSabhaReportById,
  getLatestReportByWeekId,
  getSabhaReportSendHistory,
  logSabhaReportSent,
  confirmAssignment,
  declineAssignment,
  logConfirmationEvent,
  getOverview,
  findUpcomingSabha,
  shouldSendCoordinatorReminder,
  getReminderSnapshot,
  getNotificationAssignments,
  getPendingFollowUpAssignments,
  getPersonMessageTarget,
  getBotSession,
  saveBotSession,
  clearBotSession,
  ALLOWED_CENTERS,
  getSetupStatus
};
