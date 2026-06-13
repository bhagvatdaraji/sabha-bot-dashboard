const express = require("express");
const cors = require("cors");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { nanoid } = require("nanoid");
const { port, allowedOrigins, uploadDir, rootDir } = require("./config");
const {
  getPeople,
  createPerson,
  updatePerson,
  deletePerson,
  getPersonById,
  getRoles,
  getTemplates,
  updateTemplate,
  createSabhaWeek,
  updateSabhaWeek,
  getSabhaWeekById,
  getHistory,
  deleteSabhaWeek,
  upsertAssignments,
  addUpload,
  getUploads,
  getOverview,
  generateLinkToken,
  getNotificationAssignments,
  getPersonMessageTarget,
  getSabhaSummaryByWeekId,
  getSabhaSummarySendHistory,
  upsertSabhaSummary,
  buildDefaultSummaryMessage,
  getSabhaReportById,
  getLatestReportByWeekId,
  createSabhaReportRecord
} = require("./store");
const { sendAssignmentNotification, sendDirectMessage, sendGroupMessage, sendSabhaSummary, sendSabhaReport, hasTelegramConfig } = require("./telegram");
const { generateSabhaReport } = require("./reportGenerator");

const app = express();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${nanoid(8)}${path.extname(file.originalname)}`)
});

const upload = multer({ storage });
const launcherConfigPath = path.join(rootDir, "config", "launcher.env");

app.use(cors((req, callback) => {
  const origin = req.header("Origin");
  const requestHost = req.get("host");
  const sameHostOrigin = origin && requestHost
    ? (() => {
        try {
          return new URL(origin).host === requestHost;
        } catch (_error) {
          return false;
        }
      })()
    : false;

  callback(null, {
    origin: !origin || sameHostOrigin || allowedOrigins.includes(origin),
    credentials: true
  });
}));
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

function parseBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function readLauncherConfig() {
  const defaults = {
    mode: "local",
    remoteDashboardUrl: "http://127.0.0.1:4000"
  };

  if (!fs.existsSync(launcherConfigPath)) {
    return defaults;
  }

  const contents = fs.readFileSync(launcherConfigPath, "utf8");
  const values = contents.split(/\r?\n/).reduce((accumulator, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return accumulator;
    }

    const [key, ...rest] = trimmed.split("=");
    accumulator[key] = rest.join("=");
    return accumulator;
  }, {});

  return {
    mode: values.MODE === "remote" ? "remote" : "local",
    remoteDashboardUrl: values.REMOTE_DASHBOARD_URL || defaults.remoteDashboardUrl
  };
}

function writeLauncherConfig({ mode, remoteDashboardUrl }) {
  fs.mkdirSync(path.dirname(launcherConfigPath), { recursive: true });
  const nextMode = mode === "remote" ? "remote" : "local";
  const nextRemoteDashboardUrl = (remoteDashboardUrl || "http://127.0.0.1:4000").trim();
  fs.writeFileSync(
    launcherConfigPath,
    `MODE=${nextMode}\nREMOTE_DASHBOARD_URL=${nextRemoteDashboardUrl}\n`,
    "utf8"
  );

  return readLauncherConfig();
}

function scheduleLocalRuntimeStop() {
  const stopScriptPath = path.join(rootDir, "scripts", "stop-kishorebot.command");
  if (!fs.existsSync(stopScriptPath)) {
    return false;
  }

  setTimeout(() => {
    childProcess.spawn(stopScriptPath, {
      detached: true,
      stdio: "ignore"
    }).unref();
  }, 1200);

  return true;
}

function buildLauncherStatus(req) {
  const launcher = readLauncherConfig();
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const currentDashboardUrl = `${protocol}://${req.get("host")}`;
  const dashboardHost = req.hostname || "";
  const isLocalDashboard = ["localhost", "127.0.0.1"].includes(dashboardHost);

  return {
    ...launcher,
    currentDashboardUrl,
    isLocalDashboard
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, telegramConfigured: hasTelegramConfig() });
});

app.get("/api/launcher-mode", (req, res) => {
  res.json(buildLauncherStatus(req));
});

app.put("/api/launcher-mode", (req, res) => {
  const mode = req.body.mode === "remote" ? "remote" : "local";
  const remoteDashboardUrl = req.body.remoteDashboardUrl?.trim() || "http://127.0.0.1:4000";
  const saved = writeLauncherConfig({ mode, remoteDashboardUrl });
  res.json({
    ...saved,
    currentDashboardUrl: `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`,
    isLocalDashboard: ["localhost", "127.0.0.1"].includes(req.hostname || "")
  });
});

app.post("/api/local-runtime/stop", (_req, res) => {
  const scheduled = scheduleLocalRuntimeStop();
  res.json({ ok: scheduled });
});

app.get("/api/overview", (_req, res) => {
  res.json(getOverview());
});

app.get("/api/people", (_req, res) => {
  res.json(getPeople());
});

app.post("/api/people", (req, res) => {
  const person = createPerson(req.body);
  res.status(201).json(person);
});

app.put("/api/people/:id", (req, res) => {
  const person = updatePerson(Number(req.params.id), req.body);
  res.json(person);
});

app.delete("/api/people/:id", (req, res) => {
  deletePerson(Number(req.params.id));
  res.status(204).end();
});

app.post("/api/people/:id/link-token", (req, res) => {
  const result = generateLinkToken(Number(req.params.id));
  res.json(result);
});

app.post("/api/people/:id/message", async (req, res) => {
  const person = getPersonMessageTarget(Number(req.params.id));
  if (!person) {
    res.status(404).json({ error: "Person not found." });
    return;
  }

  if (!person.telegramChatId) {
    res.status(400).json({ error: "This person has not linked Telegram yet." });
    return;
  }

  const message = req.body.message?.trim();
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  const response = await sendDirectMessage(person.telegramChatId, message);
  res.json({ ok: true, messageId: response.message_id });
});

app.post("/api/group/message", async (req, res) => {
  try {
    const result = await sendGroupMessage(req.body.message);
    res.json({
      ok: true,
      messageId: result.response.message_id,
      summaryChat: result.summaryChat
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/roles", (_req, res) => {
  res.json(getRoles());
});

app.get("/api/templates", (_req, res) => {
  res.json(getTemplates());
});

app.put("/api/templates/:roleId", (req, res) => {
  res.json(updateTemplate(Number(req.params.roleId), req.body.templateText));
});

app.post("/api/sabha-weeks", (req, res) => {
  const week = createSabhaWeek(req.body);
  res.status(201).json(week);
});

app.put("/api/sabha-weeks/:id", (req, res) => {
  const week = updateSabhaWeek(Number(req.params.id), req.body);
  res.json(week);
});

app.get("/api/sabha-weeks/:id", (req, res) => {
  const week = getSabhaWeekById(Number(req.params.id));
  if (!week) {
    res.status(404).json({ error: "Sabha week not found." });
    return;
  }

  res.json(week);
});

app.get("/api/sabha-weeks/:id/summary", (req, res) => {
  const sabhaWeek = getSabhaWeekById(Number(req.params.id));
  if (!sabhaWeek) {
    res.status(404).json({ error: "Sabha week not found." });
    return;
  }

  const summary = getSabhaSummaryByWeekId(sabhaWeek.id) || {
    sabhaWeekId: sabhaWeek.id,
    uploadId: null,
    messageText: buildDefaultSummaryMessage(sabhaWeek),
    sentAt: null,
    sendCount: 0,
    telegramMessageId: null
  };

  res.json({
    ...summary,
    sendHistory: getSabhaSummarySendHistory(sabhaWeek.id)
  });
});

app.put("/api/sabha-weeks/:id/summary", (req, res) => {
  try {
    const sabhaWeek = getSabhaWeekById(Number(req.params.id));
    if (!sabhaWeek) {
      res.status(404).json({ error: "Sabha week not found." });
      return;
    }

    const summary = upsertSabhaSummary(sabhaWeek.id, req.body);
    res.json(summary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/sabha-weeks/:id/summary/send", async (req, res) => {
  try {
    const sabhaWeek = getSabhaWeekById(Number(req.params.id));
    if (!sabhaWeek) {
      res.status(404).json({ error: "Sabha week not found." });
      return;
    }

    const summary = upsertSabhaSummary(sabhaWeek.id, req.body || {});
    const result = await sendSabhaSummary(summary);
    res.json({
      ok: true,
      sabhaWeekId: sabhaWeek.id,
      summary: {
        ...summary,
        sendHistory: getSabhaSummarySendHistory(sabhaWeek.id)
      },
      summaryChat: result.summaryChat
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/sabha-weeks/:id/report/generate", async (req, res) => {
  try {
    const sabhaWeek = getSabhaWeekById(Number(req.params.id));
    if (!sabhaWeek) {
      res.status(404).json({ error: "Sabha week not found." });
      return;
    }

    const generated = await generateSabhaReport(sabhaWeek);
    const report = createSabhaReportRecord(sabhaWeek.id, generated.fileName, generated.filePath);
    res.json(report);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/sabha-weeks/:id/report", (req, res) => {
  const sabhaWeek = getSabhaWeekById(Number(req.params.id));
  if (!sabhaWeek) {
    res.status(404).json({ error: "Sabha week not found." });
    return;
  }

  res.json(getLatestReportByWeekId(sabhaWeek.id));
});

app.post("/api/sabha-reports/:id/send", async (req, res) => {
  try {
    const report = getSabhaReportById(Number(req.params.id));
    if (!report) {
      res.status(404).json({ error: "Report not found." });
      return;
    }

    const personId = req.body.personId ? Number(req.body.personId) : null;
    if (personId && !getPersonById(personId)) {
      res.status(404).json({ error: "Recipient not found." });
      return;
    }

    const result = await sendSabhaReport(report, personId);
    res.json({
      ok: true,
      reportId: report.id,
      recipient: result.recipient
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/sabha-weeks/:id", (req, res) => {
  deleteSabhaWeek(Number(req.params.id));
  res.status(204).end();
});

app.put("/api/sabha-weeks/:id/assignments", (req, res) => {
  const assignments = upsertAssignments(Number(req.params.id), req.body.assignments || []);
  res.json(assignments);
});

app.post("/api/sabha-weeks/:id/send", async (req, res) => {
  try {
    const { sabhaWeek, assignments } = getNotificationAssignments(
      Number(req.params.id),
      req.body.assignmentIds || null
    );

    const results = [];
    for (const assignment of assignments) {
      try {
        await sendAssignmentNotification(assignment, sabhaWeek);
        results.push({ assignmentId: assignment.id, ok: true });
      } catch (error) {
        results.push({ assignmentId: assignment.id, ok: false, error: error.message });
      }
    }

    res.json({ sabhaWeekId: sabhaWeek.id, results });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/history", (_req, res) => {
  res.json(getHistory());
});

app.get("/api/uploads", (_req, res) => {
  res.json(getUploads());
});

app.post("/api/uploads", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  res.status(201).json(addUpload(req.file));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Internal server error." });
});

const clientDistDir = path.join(rootDir, "client", "dist");
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Kishore Sabha API running on http://localhost:${port}`);
});
