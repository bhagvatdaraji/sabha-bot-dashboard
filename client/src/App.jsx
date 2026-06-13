import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV
  ? "http://127.0.0.1:8787/api"
  : "https://replace-me.workers.dev/api");

const TOKEN_KEY = "kishore_admin_token";

const emptyPerson = {
  firstName: "",
  lastName: "",
  bkmsId: "",
  center: "",
  telegramChatId: "",
  active: true,
  isCoordinator: false
};

const emptyWeek = {
  sabhaDate: "",
  sabhaTime: "16:30",
  notes: "",
  status: "scheduled"
};

const PLACEHOLDER_OPTION = "__placeholder__";

const emptyDmState = {
  personId: "",
  message: ""
};

const emptyGroupMessageState = {
  message: ""
};

const emptySummaryState = {
  sabhaWeekId: "",
  messageText: "",
  sentAt: null,
  sendHistory: []
};

const emptyAttendanceOverview = {
  currentWeek: null,
  pastWeeks: []
};

const ATTENDANCE_FILTERS = {
  all: "all",
  present: "Present",
  late: "Late",
  absent: "Absent",
  unchecked: "unchecked"
};

const TABS = {
  members: "members",
  planner: "planner",
  history: "history",
  attendance: "attendance",
  summary: "summary"
};

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

async function apiFetch(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Request failed" }));
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function getAssignmentSendLabel(assignment) {
  if (assignment.placeholderName && !assignment.personId) {
    return "Placeholder only";
  }
  if (assignment.needsResend) {
    return `Edited after send (${assignment.sendCount} sent)`;
  }
  if (!assignment.sendCount) {
    return "Not sent yet";
  }
  if (assignment.sendCount === 1) {
    return "Sent once";
  }
  return `Sent ${assignment.sendCount} times`;
}

function getWeekSendLabel(week) {
  const summary = week.sendSummary || {
    totalAssignments: week.assignments.length,
    sentAssignments: week.assignments.filter((assignment) => assignment.sendCount > 0).length,
    unsentAssignments: week.assignments.filter((assignment) => !assignment.sendCount).length,
    resendPending: week.assignments.filter((assignment) => assignment.needsResend).length,
    resentAssignments: week.assignments.filter((assignment) => assignment.sendCount > 1).length
  };

  if (summary.totalAssignments === 0) {
    return "No assignments yet";
  }
  if (summary.resendPending > 0) {
    return `${summary.resendPending} changed need resend`;
  }
  if (summary.unsentAssignments > 0 && summary.sentAssignments > 0) {
    return `${summary.sentAssignments}/${summary.totalAssignments} sent`;
  }
  if (summary.unsentAssignments === summary.totalAssignments) {
    return "Assignments not sent";
  }
  if (summary.resentAssignments > 0) {
    return `Resent ${summary.resentAssignments} assignment${summary.resentAssignments === 1 ? "" : "s"}`;
  }
  return "Assignments sent";
}

function isUpcomingWeek(week) {
  return new Date(`${week.sabhaDate}T${week.sabhaTime}`) >= new Date();
}

function getSummarySendLabel(summaryForm) {
  if (!summaryForm.sabhaWeekId) {
    return "Pick a Sabha week";
  }
  if (!summaryForm.sentAt) {
    return "Summary not sent";
  }
  return `Last sent ${new Date(summaryForm.sentAt).toLocaleString()}`;
}

function formatSummaryDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateString
    : date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      });
}

function getAttendanceStatusLabel(record) {
  return record.status || "Not checked in yet";
}

function getAttendanceStatusTone(status) {
  if (status === "Present") {
    return "badge--success";
  }
  if (status === "Late") {
    return "badge--warm";
  }
  if (status === "Absent") {
    return "badge--danger";
  }
  return "badge--outline";
}

function getAttendanceQrUrl(deepLink) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(deepLink)}`;
}

function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function StatCard({ label, value, tone = "default" }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PersonForm({ form, onChange, onSubmit, submitLabel }) {
  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <h3>{submitLabel}</h3>
      <label>
        First name
        <input value={form.firstName} onChange={(e) => onChange("firstName", e.target.value)} required />
      </label>
      <label>
        Last name
        <input value={form.lastName} onChange={(e) => onChange("lastName", e.target.value)} required />
      </label>
      <label>
        BKMS ID
        <input value={form.bkmsId} onChange={(e) => onChange("bkmsId", e.target.value)} required />
      </label>
      <label>
        Center
        <input value={form.center} onChange={(e) => onChange("center", e.target.value)} required />
      </label>
      <label>
        Telegram chat ID
        <input
          value={form.telegramChatId}
          onChange={(e) => onChange("telegramChatId", e.target.value)}
          placeholder="Optional manual Telegram chat ID"
        />
        <small>
          Optional. Telegram may still require the user to have started the bot once before it can DM them.
        </small>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={form.active} onChange={(e) => onChange("active", e.target.checked)} />
        Active member
      </label>
      <label className="toggle">
        <input type="checkbox" checked={form.isCoordinator} onChange={(e) => onChange("isCoordinator", e.target.checked)} />
        Kishore coordinator
      </label>
      <button type="submit" className="primary">{submitLabel}</button>
    </form>
  );
}

function AssignmentEditor({ roles, people, assignments, onChange }) {
  const assignedCount = roles.filter((role) => {
    const assignment = assignments[role.id];
    return assignment?.personId || assignment?.placeholderName?.trim();
  }).length;

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Assignments</h3>
        <p>
          Assign only the roles you need for this week.
          {` ${assignedCount} role${assignedCount === 1 ? "" : "s"} currently assigned.`}
        </p>
      </div>
      <div className="assignment-list">
        {roles.map((role) => {
          const assignment = assignments[role.id] || {};
          const selectValue = assignment.personId
            ? String(assignment.personId)
            : assignment.isPlaceholder
              ? PLACEHOLDER_OPTION
              : "";
          return (
            <div key={role.id} className="assignment-row">
              <div>
                <strong>{role.name}</strong>
              </div>
              <select
                value={selectValue}
                onChange={(e) => {
                  if (e.target.value === PLACEHOLDER_OPTION) {
                    onChange(role.id, "isPlaceholder", true);
                    onChange(role.id, "personId", "");
                    onChange(role.id, "placeholderName", assignment.placeholderName || "");
                    return;
                  }
                  onChange(role.id, "isPlaceholder", false);
                  onChange(role.id, "placeholderName", "");
                  onChange(role.id, "personId", e.target.value ? Number(e.target.value) : "");
                }}
              >
                <option value="">Select member</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
                  </option>
                ))}
                <option value={PLACEHOLDER_OPTION}>Write placeholder name</option>
              </select>
              {selectValue === PLACEHOLDER_OPTION && (
                <input
                  placeholder="Type placeholder name"
                  value={assignment.placeholderName || ""}
                  onChange={(e) => onChange(role.id, "placeholderName", e.target.value)}
                />
              )}
              <textarea
                rows="2"
                placeholder="Optional custom message override"
                value={assignment.customMessage || ""}
                onChange={(e) => onChange(role.id, "customMessage", e.target.value)}
              />
              <div className="assignment-status">
                <span className={`badge ${assignment.needsResend ? "badge--warm" : assignment.sendCount > 1 ? "badge--accent" : ""}`}>
                  {getAssignmentSendLabel(assignment)}
                </span>
                {assignment.placeholderName && <span className="badge badge--outline">Placeholder</span>}
                {assignment.confirmedAt && <span className="badge badge--success">Confirmed</span>}
                {assignment.declinedAt && <span className="badge badge--danger">Can't do it</span>}
                {assignment.followUpSentAt && <span className="badge badge--accent">Follow-up sent</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoginScreen({ password, onPasswordChange, onSubmit, errorMessage }) {
  return (
    <div className="loading-screen">
      <form className="panel form-grid login-panel" onSubmit={onSubmit}>
        <p className="eyebrow">Kishore Sabha Coordinator</p>
        <h2>Admin Login</h2>
        <p>Use the admin password stored in your Cloudflare Worker secret to open the dashboard.</p>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} required />
        </label>
        {errorMessage && <div className="status-banner status-banner--error">{errorMessage}</div>}
        <button type="submit" className="primary">Login</button>
      </form>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(Boolean(getStoredToken()));
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [overview, setOverview] = useState(null);
  const [attendanceOverview, setAttendanceOverview] = useState(emptyAttendanceOverview);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);
  const [botUsername, setBotUsername] = useState("");
  const [personForm, setPersonForm] = useState(emptyPerson);
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [weekForm, setWeekForm] = useState(emptyWeek);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [assignmentsDraft, setAssignmentsDraft] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dmState, setDmState] = useState(emptyDmState);
  const [groupMessageState, setGroupMessageState] = useState(emptyGroupMessageState);
  const [summaryForm, setSummaryForm] = useState(emptySummaryState);
  const [selectedAttendanceWeekId, setSelectedAttendanceWeekId] = useState("");
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [attendanceFilter, setAttendanceFilter] = useState(ATTENDANCE_FILTERS.all);
  const [attendanceExpiryInput, setAttendanceExpiryInput] = useState("");
  const [activeTab, setActiveTab] = useState(TABS.members);
  const [showTemplates, setShowTemplates] = useState(false);

  const upcomingWeeks = useMemo(() => history.filter((week) => isUpcomingWeek(week)), [history]);
  const pastWeeks = useMemo(() => history.filter((week) => !isUpcomingWeek(week)), [history]);
  const attendanceWeeks = useMemo(
    () => [attendanceOverview?.currentWeek, ...(attendanceOverview?.pastWeeks || [])].filter(Boolean),
    [attendanceOverview]
  );
  const selectedAttendanceWeek = useMemo(
    () => attendanceWeeks.find((week) => String(week.id) === String(selectedAttendanceWeekId)) || attendanceOverview?.currentWeek || null,
    [attendanceWeeks, attendanceOverview, selectedAttendanceWeekId]
  );
  const filteredAttendanceRecords = useMemo(() => {
    if (!selectedAttendanceWeek) {
      return [];
    }
    const records = [...(selectedAttendanceWeek.records || [])];
    const statusOf = (record) => attendanceDraft[record.personId]?.status || record.status || "";
    const priority = (record) => {
      const status = statusOf(record);
      if (attendanceFilter === ATTENDANCE_FILTERS.all) {
        if (status === "Present") return 0;
        if (status === "Late") return 1;
        if (status === "Absent") return 2;
        return 3;
      }
      if (attendanceFilter === ATTENDANCE_FILTERS.unchecked) {
        return status ? 1 : 0;
      }
      return status === attendanceFilter ? 0 : 1;
    };
    records.sort((a, b) => {
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      return a.personName.localeCompare(b.personName);
    });
    return records;
  }, [selectedAttendanceWeek, attendanceDraft, attendanceFilter]);

  async function loadBootstrap(authToken = token) {
    if (!authToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch("/bootstrap", authToken);
      setOverview(data.overview);
      setAttendanceOverview(data.attendance || emptyAttendanceOverview);
      setPeople(data.people);
      setRoles(data.roles);
      setTemplates(data.templates);
      setHistory(data.history);
      setBotUsername(data.botUsername || "");

      const selectedWeekId = currentWeek?.id;
      const activeWeek = data.history.find((week) => week.id === selectedWeekId) || data.history[0] || null;
      setCurrentWeek(activeWeek);
      if (activeWeek) {
        hydrateAssignments(activeWeek);
        setWeekForm({
          sabhaDate: activeWeek.sabhaDate,
          sabhaTime: activeWeek.sabhaTime,
          notes: activeWeek.notes || "",
          status: activeWeek.status
        });
        hydrateSummary(activeWeek);
      }
      const nextAttendanceWeekId = selectedAttendanceWeekId
        && (data.attendance?.currentWeek?.id === Number(selectedAttendanceWeekId)
          || (data.attendance?.pastWeeks || []).some((week) => week.id === Number(selectedAttendanceWeekId)))
        ? selectedAttendanceWeekId
        : String(data.attendance?.currentWeek?.id || "");
      setSelectedAttendanceWeekId(nextAttendanceWeekId);
      const nextAttendanceWeek = [data.attendance?.currentWeek, ...(data.attendance?.pastWeeks || [])]
        .filter(Boolean)
        .find((week) => String(week.id) === nextAttendanceWeekId)
        || data.attendance?.currentWeek
        || null;
      if (nextAttendanceWeek) {
        hydrateAttendance(nextAttendanceWeek);
      } else {
        setAttendanceDraft({});
      }
      setErrorMessage("");
    } catch (error) {
      if (error.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadBootstrap(token);
    }
  }, [token]);

  function hydrateAssignments(week) {
    const nextState = {};
    week.assignments.forEach((assignment) => {
      nextState[assignment.roleId] = {
        assignmentId: assignment.id,
        roleId: assignment.roleId,
        personId: assignment.personId,
        isPlaceholder: Boolean(assignment.placeholderName && !assignment.personId),
        placeholderName: assignment.placeholderName || "",
        customMessage: assignment.customMessage || "",
        sentAt: assignment.sentAt,
        confirmedAt: assignment.confirmedAt,
        declinedAt: assignment.declinedAt,
        followUpSentAt: assignment.followUpSentAt,
        sendCount: assignment.sendCount || 0,
        needsResend: assignment.needsResend || false
      };
    });
    setAssignmentsDraft(nextState);
  }

  function buildDefaultSummaryMessage(week) {
    return `Jai Swaminaryan! In this weeks sabha (${formatSummaryDate(week.sabhaDate)}) we learned:`;
  }

  function hydrateSummary(week) {
    const summary = week.summary;
    setSummaryForm({
      sabhaWeekId: String(week.id),
      messageText: summary?.messageText || buildDefaultSummaryMessage(week),
      sentAt: summary?.sentAt || null,
      sendHistory: summary?.sendHistory || []
    });
  }

  function hydrateAttendance(week) {
    setSelectedAttendanceWeekId(String(week.id));
    setAttendanceFilter(ATTENDANCE_FILTERS.all);
    setAttendanceExpiryInput(toDateTimeLocalValue(week.session?.expiresAt || week.expiresAt));
    const nextDraft = {};
    (week.records || []).forEach((record) => {
      nextDraft[record.personId] = {
        status: record.status || "",
        notes: record.notes || ""
      };
    });
    setAttendanceDraft(nextDraft);
  }

  function updatePersonForm(field, value) {
    setPersonForm((current) => ({ ...current, [field]: value }));
  }

  function updateWeekForm(field, value) {
    setWeekForm((current) => ({ ...current, [field]: value }));
  }

  function updateAssignment(roleId, field, value) {
    setAssignmentsDraft((current) => ({
      ...current,
      [roleId]: {
        ...current[roleId],
        roleId,
        [field]: value
      }
    }));
  }

  function updateSummaryForm(field, value) {
    setSummaryForm((current) => ({ ...current, [field]: value }));
  }

  function updateAttendanceDraft(personId, field, value) {
    setAttendanceDraft((current) => ({
      ...current,
      [personId]: {
        ...current[personId],
        [field]: value
      }
    }));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const data = await apiFetch("/auth/login", "", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword("");
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setOverview(null);
    setAttendanceOverview(emptyAttendanceOverview);
    setPeople([]);
    setRoles([]);
    setTemplates([]);
    setHistory([]);
    setCurrentWeek(null);
    setAssignmentsDraft({});
    setSelectedAttendanceWeekId("");
    setAttendanceDraft({});
  }

  async function handlePersonSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    try {
      if (editingPersonId) {
        await apiFetch(`/people/${editingPersonId}`, token, {
          method: "PUT",
          body: JSON.stringify(personForm)
        });
        setStatusMessage("Member updated.");
      } else {
        await apiFetch("/people", token, {
          method: "POST",
          body: JSON.stringify(personForm)
        });
        setStatusMessage("Member added.");
      }
      setPersonForm(emptyPerson);
      setEditingPersonId(null);
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  function beginEditPerson(person) {
    setEditingPersonId(person.id);
    setPersonForm({
      firstName: person.firstName,
      lastName: person.lastName,
      bkmsId: person.bkmsId,
      center: person.center,
      telegramChatId: person.telegramChatId || "",
      active: person.active,
      isCoordinator: person.isCoordinator
    });
  }

  async function handleGenerateLink(personId) {
    try {
      const data = await apiFetch(`/people/${personId}/link-token`, token, { method: "POST" });
      setStatusMessage(`Connect code for ${data.person.firstName}: /start ${data.token}`);
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleDeletePerson(personId) {
    const person = people.find((item) => item.id === personId);
    if (!person || !window.confirm(`Delete ${person.firstName} ${person.lastName} from the database?`)) {
      return;
    }
    try {
      await apiFetch(`/people/${personId}`, token, { method: "DELETE" });
      setStatusMessage("Member deleted.");
      if (editingPersonId === personId) {
        setEditingPersonId(null);
        setPersonForm(emptyPerson);
      }
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSaveWeek(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    try {
      const week = currentWeek?.id
        ? await apiFetch(`/sabha-weeks/${currentWeek.id}`, token, {
            method: "PUT",
            body: JSON.stringify(weekForm)
          })
        : await apiFetch("/sabha-weeks", token, {
            method: "POST",
            body: JSON.stringify(weekForm)
          });

      const assignmentPayload = roles
        .map((role) => ({ roleId: role.id, assignment: assignmentsDraft[role.id] }))
        .filter(({ assignment }) => assignment?.personId || assignment?.placeholderName?.trim())
        .map(({ roleId, assignment }) => ({
          roleId,
          personId: assignment.personId || null,
          placeholderName: assignment.placeholderName?.trim() || null,
          customMessage: assignment.customMessage || null
        }));

      await apiFetch(`/sabha-weeks/${week.id}/assignments`, token, {
        method: "PUT",
        body: JSON.stringify({ assignments: assignmentPayload })
      });

      setStatusMessage("Sabha week saved.");
      await loadBootstrap();
      const refreshedWeek = await apiFetch(`/sabha-weeks/${week.id}`, token);
      setCurrentWeek(refreshedWeek);
      hydrateAssignments(refreshedWeek);
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSendAssignments(weekId = currentWeek?.id) {
    if (!weekId) {
      setErrorMessage("Create and save a Sabha week first.");
      return;
    }
    try {
      const result = await apiFetch(`/sabha-weeks/${weekId}/send`, token, {
        method: "POST",
        body: JSON.stringify({})
      });
      const failed = result.results.filter((item) => !item.ok);
      const sentCount = result.results.filter((item) => item.ok).length;
      setStatusMessage(
        failed.length
          ? `${sentCount} assignment message${sentCount === 1 ? "" : "s"} sent. Some failed: ${failed.map((item) => item.error).join("; ")}`
          : `${sentCount} assignment message${sentCount === 1 ? "" : "s"} sent.`
      );
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleDeleteWeek(weekId) {
    const week = history.find((item) => item.id === weekId);
    if (!week || !window.confirm(`Delete Sabha week for ${week.sabhaDate} at ${week.sabhaTime}?`)) {
      return;
    }
    try {
      await apiFetch(`/sabha-weeks/${weekId}`, token, { method: "DELETE" });
      setStatusMessage("Sabha week deleted.");
      if (currentWeek?.id === weekId) {
        setCurrentWeek(null);
        setWeekForm(emptyWeek);
        setAssignmentsDraft({});
      }
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleTemplateChange(roleId, templateText) {
    try {
      const updated = await apiFetch(`/templates/${roleId}`, token, {
        method: "PUT",
        body: JSON.stringify({ templateText })
      });
      setTemplates(updated);
      setStatusMessage("Templates updated.");
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSendDirectMessage(event) {
    event.preventDefault();
    if (!dmState.personId) {
      setErrorMessage("Choose a linked member to message.");
      return;
    }
    try {
      await apiFetch(`/people/${dmState.personId}/message`, token, {
        method: "POST",
        body: JSON.stringify({ message: dmState.message })
      });
      setStatusMessage("Direct message sent from the bot.");
      setDmState(emptyDmState);
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSendGroupMessage(event) {
    event.preventDefault();
    try {
      const result = await apiFetch("/group/message", token, {
        method: "POST",
        body: JSON.stringify({ message: groupMessageState.message })
      });
      setStatusMessage(`Message sent to ${result.summaryChat?.title || "the group"}.`);
      setGroupMessageState(emptyGroupMessageState);
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSaveSummary(event) {
    event.preventDefault();
    if (!summaryForm.sabhaWeekId) {
      setErrorMessage("Choose a Sabha week for the summary.");
      return;
    }
    try {
      const saved = await apiFetch(`/sabha-weeks/${summaryForm.sabhaWeekId}/summary`, token, {
        method: "PUT",
        body: JSON.stringify({ messageText: summaryForm.messageText })
      });
      setSummaryForm((current) => ({
        ...current,
        sentAt: saved.sentAt || null,
        sendHistory: saved.sendHistory || current.sendHistory
      }));
      setStatusMessage("Sabha summary saved.");
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSendSummary() {
    if (!summaryForm.sabhaWeekId) {
      setErrorMessage("Choose a Sabha week for the summary.");
      return;
    }
    try {
      const result = await apiFetch(`/sabha-weeks/${summaryForm.sabhaWeekId}/summary/send`, token, {
        method: "POST",
        body: JSON.stringify({ messageText: summaryForm.messageText })
      });
      setStatusMessage(`Sabha summary sent to ${result.summaryChat?.title || "the group"}.`);
      setSummaryForm((current) => ({
        ...current,
        sentAt: result.summary?.sentAt || current.sentAt,
        sendHistory: result.summary?.sendHistory || current.sendHistory
      }));
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSelectAttendanceWeek(weekId) {
    try {
      const week = await apiFetch(`/sabha-weeks/${weekId}/attendance`, token);
      hydrateAttendance(week);
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleGenerateAttendanceSession(weekId, refresh = false) {
    try {
      const session = await apiFetch(`/sabha-weeks/${weekId}/attendance/session`, token, {
        method: "POST",
        body: JSON.stringify({ refresh })
      });
      setAttendanceExpiryInput(toDateTimeLocalValue(session.expiresAt));
      setStatusMessage(refresh ? "Attendance QR refreshed." : "Attendance QR generated.");
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleUpdateAttendanceSession(weekId, payload, successMessage) {
    try {
      const session = await apiFetch(`/sabha-weeks/${weekId}/attendance/session`, token, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setAttendanceExpiryInput(toDateTimeLocalValue(session.expiresAt));
      setStatusMessage(successMessage);
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSaveAttendance() {
    if (!selectedAttendanceWeek) {
      setErrorMessage("Choose a Sabha week for attendance.");
      return;
    }
    try {
      const records = (selectedAttendanceWeek.records || []).map((record) => ({
        personId: record.personId,
        status: attendanceDraft[record.personId]?.status || null,
        notes: attendanceDraft[record.personId]?.notes || ""
      }));
      const updated = await apiFetch(`/sabha-weeks/${selectedAttendanceWeek.id}/attendance`, token, {
        method: "PUT",
        body: JSON.stringify({ records })
      });
      hydrateAttendance(updated);
      setStatusMessage("Attendance updated.");
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSendAttendanceReport(weekId) {
    try {
      await apiFetch(`/sabha-weeks/${weekId}/attendance/report`, token, {
        method: "POST",
        body: JSON.stringify({})
      });
      setStatusMessage("Attendance report sent to the coordinator.");
      await loadBootstrap();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  function startNewWeek() {
    setActiveTab(TABS.planner);
    setCurrentWeek(null);
    setWeekForm(emptyWeek);
    setAssignmentsDraft({});
  }

  if (!token) {
    return (
      <LoginScreen
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        errorMessage={loginError || (loggingIn ? "Logging in..." : "")}
      />
    );
  }

  if (loading) {
    return <div className="loading-screen">Loading Kishore Sabha dashboard...</div>;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Kishore Sabha Coordinator</p>
          <h1>Plan weekly Sabha roles, send Telegram assignments, and track confirmations.</h1>
          <p className="hero-subtitle">
            Hosted dashboard + Cloudflare Worker bot. Telegram bot: {botUsername ? `@${botUsername}` : "not configured"}.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={startNewWeek}>New Sabha Week</button>
          <button className="ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Dashboard sections">
        <button type="button" className={`tab-button ${activeTab === TABS.members ? "tab-button--active" : ""}`} onClick={() => setActiveTab(TABS.members)}>
          Add Members
        </button>
        <button type="button" className={`tab-button ${activeTab === TABS.planner ? "tab-button--active" : ""}`} onClick={() => setActiveTab(TABS.planner)}>
          Weekly Sabha Planner
        </button>
        <button type="button" className={`tab-button ${activeTab === TABS.history ? "tab-button--active" : ""}`} onClick={() => setActiveTab(TABS.history)}>
          Sabha History
        </button>
        <button type="button" className={`tab-button ${activeTab === TABS.attendance ? "tab-button--active" : ""}`} onClick={() => setActiveTab(TABS.attendance)}>
          Attendance
        </button>
        <button type="button" className={`tab-button ${activeTab === TABS.summary ? "tab-button--active" : ""}`} onClick={() => setActiveTab(TABS.summary)}>
          Sabha Summary
        </button>
      </nav>

      {(statusMessage || errorMessage) && (
        <div className={`status-banner ${errorMessage ? "status-banner--error" : ""}`}>
          {errorMessage || statusMessage}
        </div>
      )}

      <section className="stats-grid">
        <StatCard label="Active members" value={overview?.peopleCount || 0} />
        <StatCard label="Telegram linked" value={overview?.linkedCount || 0} tone="accent" />
        <StatCard label="Coordinator" value={overview?.coordinator ? `${overview.coordinator.firstName} ${overview.coordinator.lastName}` : "None set"} tone="warm" />
        <StatCard label="Unconfirmed assignments" value={overview?.unconfirmedCount || 0} tone={(overview?.unconfirmedCount || 0) > 0 ? "danger" : "success"} />
      </section>

      <main className="tab-content">
        {activeTab === TABS.members && (
          <section className="tab-panel tab-panel--members">
            <PersonForm
              form={personForm}
              onChange={updatePersonForm}
              onSubmit={handlePersonSubmit}
              submitLabel={editingPersonId ? "Update Member" : "Add Member"}
            />

            <div className="panel">
              <div className="panel-header">
                <h3>People</h3>
                <p>Manual member entry with BKMS ID, center, Telegram linking, and coordinator assignment.</p>
              </div>
              <div className="table-list">
                {people.map((person) => (
                  <div key={person.id} className="person-row">
                    <div>
                      <strong>{person.firstName} {person.lastName}</strong>
                      <p>{person.center} · BKMS {person.bkmsId}</p>
                      {person.telegramChatId && <p>Telegram chat ID: {person.telegramChatId}</p>}
                    </div>
                    <div className="person-meta">
                      {person.isCoordinator && <span className="badge badge--warm">Coordinator</span>}
                      {person.telegramChatId ? <span className="badge badge--success">Linked</span> : <span className="badge">Not linked</span>}
                    </div>
                    <div className="row-actions">
                      <button className="ghost" onClick={() => beginEditPerson(person)}>Edit</button>
                      <button className="ghost" onClick={() => handleGenerateLink(person.id)}>Generate Connect Code</button>
                      {person.telegramChatId && (
                        <button className="ghost" onClick={() => setDmState((current) => ({ ...current, personId: String(person.id) }))}>
                          Message
                        </button>
                      )}
                      <button className="ghost ghost--danger" onClick={() => handleDeletePerson(person.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form className="panel form-grid" onSubmit={handleSendDirectMessage}>
              <div className="panel-header">
                <h3>Message From Bot</h3>
                <p>Send a direct Telegram message to any linked member from the dashboard.</p>
              </div>
              <label>
                Member
                <select value={dmState.personId} onChange={(e) => setDmState((current) => ({ ...current, personId: e.target.value }))} required>
                  <option value="">Choose linked member</option>
                  {people.filter((person) => person.telegramChatId).map((person) => (
                    <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
                  ))}
                </select>
              </label>
              <label>
                Message
                <textarea
                  rows="4"
                  value={dmState.message}
                  onChange={(e) => setDmState((current) => ({ ...current, message: e.target.value }))}
                  placeholder="Write the Telegram message you want the bot to send."
                  required
                />
              </label>
              <button type="submit" className="primary">Send Direct Message</button>
            </form>
          </section>
        )}

        {activeTab === TABS.planner && (
          <section className="tab-panel tab-panel--planner">
            <form className="panel form-grid" onSubmit={handleSaveWeek}>
              <div className="panel-header">
                <h3>Weekly Sabha Planner</h3>
                <p>Create or edit a Sabha, swap people as needed, then send only the new or changed assignments.</p>
              </div>
              <label>
                Sabha date
                <input type="date" value={weekForm.sabhaDate} onChange={(e) => updateWeekForm("sabhaDate", e.target.value)} required />
              </label>
              <label>
                Start time
                <input type="time" value={weekForm.sabhaTime} onChange={(e) => updateWeekForm("sabhaTime", e.target.value)} required />
              </label>
              <label>
                Status
                <select value={weekForm.status} onChange={(e) => updateWeekForm("status", e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="full-width">
                Notes
                <textarea rows="3" value={weekForm.notes} onChange={(e) => updateWeekForm("notes", e.target.value)} placeholder="Optional weekly notes" />
              </label>
              <button type="submit" className="primary">Save Sabha Week</button>
            </form>

            <AssignmentEditor roles={roles} people={people.filter((person) => person.active)} assignments={assignmentsDraft} onChange={updateAssignment} />

            <div className="panel">
              <button type="button" className="collapse-toggle" onClick={() => setShowTemplates((current) => !current)}>
                <span>Message Templates</span>
                <span>{showTemplates ? "Hide" : "Show"}</span>
              </button>
              {showTemplates && (
                <div className="template-list template-list--expanded">
                  <p className="template-note">Use placeholders like <code>{`{{firstName}}`}</code>, <code>{`{{role}}`}</code>, <code>{`{{date}}`}</code>, and <code>{`{{time}}`}</code>.</p>
                  {templates.map((template) => (
                    <label key={template.roleId}>
                      {template.roleName}
                      <textarea rows="3" defaultValue={template.templateText} onBlur={(e) => handleTemplateChange(template.roleId, e.target.value)} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === TABS.history && (
          <section className="tab-panel tab-panel--history">
            <div className="panel">
              <div className="panel-header">
                <h3>Coordinator View</h3>
                <p>
                  {overview?.nextWeekScheduled
                    ? "A future Sabha is already scheduled."
                    : "No future Sabha is scheduled yet. The coordinator will be reminded Saturday at 8:00 p.m. and daily at 12:00 p.m."}
                </p>
              </div>
              <div className="history-list">
                {(history[0]?.assignments || []).filter((item) => !item.confirmedAt && !item.declinedAt).map((item) => (
                  <div key={item.id} className="history-card">
                    <strong>{item.roleName}</strong>
                    <p>{item.personName}</p>
                    <span className="badge">Awaiting confirmation</span>
                  </div>
                ))}
                {(history[0]?.assignments || []).filter((item) => item.declinedAt).map((item) => (
                  <div key={item.id} className="history-card">
                    <strong>{item.roleName}</strong>
                    <p>{item.personName}</p>
                    <span className="badge badge--danger">Declined</span>
                    {item.declineReason && <p className="reason-text">Reason: {item.declineReason}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Upcoming Sabha</h3>
                <p>Upcoming Sabha schedules appear first so you can edit and send from each one directly.</p>
              </div>
              <div className="history-list">
                {upcomingWeeks.map((week) => (
                  <button
                    type="button"
                    key={week.id}
                    className={`history-card history-card--button ${currentWeek?.id === week.id ? "history-card--active" : ""}`}
                    onClick={() => {
                      setCurrentWeek(week);
                      setWeekForm({
                        sabhaDate: week.sabhaDate,
                        sabhaTime: week.sabhaTime,
                        notes: week.notes || "",
                        status: week.status
                      });
                      hydrateAssignments(week);
                    }}
                  >
                    <strong>{week.sabhaDate}</strong>
                    <p>{week.sabhaTime} · {week.status}</p>
                    <div className="history-send-summary">
                      <span className={`badge ${week.sendSummary?.resendPending ? "badge--warm" : week.sendSummary?.resentAssignments ? "badge--accent" : week.sendSummary?.sentAssignments ? "badge--success" : ""}`}>
                        {getWeekSendLabel(week)}
                      </span>
                    </div>
                    <div className="history-roles">
                      {week.assignments.map((assignment) => (
                        <span key={assignment.id} className={`badge ${assignment.declinedAt ? "badge--danger" : assignment.confirmedAt ? "badge--success" : assignment.needsResend ? "badge--warm" : assignment.sendCount > 1 ? "badge--accent" : ""}`}>
                          {assignment.roleName}: {assignment.firstName}
                        </span>
                      ))}
                    </div>
                    {week.assignments.some((assignment) => assignment.declineReason) && (
                      <div className="reason-list">
                        {week.assignments.filter((assignment) => assignment.declineReason).map((assignment) => (
                          <p key={`${assignment.id}-reason`} className="reason-text">
                            {assignment.firstName} on {assignment.roleName}: {assignment.declineReason}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="history-actions">
                      <span className="badge badge--outline">{week.assignments.length} assigned</span>
                      <div className="history-button-row">
                        <button type="button" className="ghost" onClick={(event) => {
                          event.stopPropagation();
                          setActiveTab(TABS.planner);
                          setCurrentWeek(week);
                          setWeekForm({
                            sabhaDate: week.sabhaDate,
                            sabhaTime: week.sabhaTime,
                            notes: week.notes || "",
                            status: week.status
                          });
                          hydrateAssignments(week);
                        }}>
                          Edit Sabha
                        </button>
                        <button type="button" className="primary history-send-button" onClick={(event) => {
                          event.stopPropagation();
                          handleSendAssignments(week.id);
                        }}>
                          Send New/Changed
                        </button>
                      </div>
                      <button type="button" className="ghost ghost--danger" onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteWeek(week.id);
                      }}>
                        Delete
                      </button>
                    </div>
                  </button>
                ))}
                {upcomingWeeks.length === 0 && (
                  <div className="history-card">
                    <strong>No upcoming Sabha</strong>
                    <p>Create a new Sabha week from the planner when you are ready.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Past Sabha</h3>
                <p>Past Sabha schedules stay below for reference and comparison.</p>
              </div>
              <div className="history-list">
                {pastWeeks.map((week) => (
                  <div key={week.id} className="history-card">
                    <strong>{week.sabhaDate}</strong>
                    <p>{week.sabhaTime} · {week.status}</p>
                    <div className="history-send-summary">
                      <span className={`badge ${week.sendSummary?.resendPending ? "badge--warm" : week.sendSummary?.resentAssignments ? "badge--accent" : week.sendSummary?.sentAssignments ? "badge--success" : ""}`}>
                        {getWeekSendLabel(week)}
                      </span>
                    </div>
                    <div className="history-roles">
                      {week.assignments.map((assignment) => (
                        <span key={assignment.id} className={`badge ${assignment.declinedAt ? "badge--danger" : assignment.confirmedAt ? "badge--success" : assignment.needsResend ? "badge--warm" : assignment.sendCount > 1 ? "badge--accent" : ""}`}>
                          {assignment.roleName}: {assignment.firstName}
                        </span>
                      ))}
                    </div>
                    {week.assignments.some((assignment) => assignment.declineReason) && (
                      <div className="reason-list">
                        {week.assignments.filter((assignment) => assignment.declineReason).map((assignment) => (
                          <p key={`${assignment.id}-reason`} className="reason-text">
                            {assignment.firstName} on {assignment.roleName}: {assignment.declineReason}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="history-actions">
                      <span className="badge badge--outline">{week.assignments.length} assigned</span>
                      <button type="button" className="ghost ghost--danger" onClick={() => handleDeleteWeek(week.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {pastWeeks.length === 0 && (
                  <div className="history-card">
                    <strong>No past Sabha</strong>
                    <p>Past weeks will appear here after their scheduled time passes.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === TABS.attendance && (
          <section className="tab-panel tab-panel--attendance">
            <div className="panel">
              <div className="panel-header">
                <h3>Attendance Check-In</h3>
                <p>Generate the QR, adjust its expiry if needed, and keep the live roster simple.</p>
              </div>
              {attendanceOverview?.currentWeek ? (
                <div className="attendance-session-shell">
                  <div className="attendance-session-card">
                    <div className="attendance-session-copy">
                      <strong>{attendanceOverview.currentWeek.sabhaDate}</strong>
                      <p>{attendanceOverview.currentWeek.sabhaTime}</p>
                      <div className="attendance-actions">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => handleGenerateAttendanceSession(attendanceOverview.currentWeek.id, Boolean(attendanceOverview.currentWeek.session))}
                        >
                          {attendanceOverview.currentWeek.session ? "Refresh QR Token" : "Generate Attendance QR"}
                        </button>
                        {attendanceOverview.currentWeek.session?.deepLink && (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => navigator.clipboard.writeText(attendanceOverview.currentWeek.session.deepLink)}
                          >
                            Copy Deep Link
                          </button>
                        )}
                      </div>
                      {attendanceOverview.currentWeek.session ? (
                        <>
                          <div className="attendance-expiry-row">
                            <label className="attendance-expiry-field">
                              QR expires at
                              <input
                                type="datetime-local"
                                value={attendanceExpiryInput}
                                onChange={(e) => setAttendanceExpiryInput(e.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => handleUpdateAttendanceSession(
                                attendanceOverview.currentWeek.id,
                                { expiresAt: new Date(attendanceExpiryInput).toISOString(), active: true },
                                "Attendance QR expiry updated."
                              )}
                              disabled={!attendanceExpiryInput}
                            >
                              Save Expiry
                            </button>
                            <button
                              type="button"
                              className="ghost ghost--danger"
                              onClick={() => handleUpdateAttendanceSession(
                                attendanceOverview.currentWeek.id,
                                { expiresAt: new Date().toISOString(), active: false },
                                "Attendance QR expired."
                              )}
                            >
                              Expire QR Code
                            </button>
                          </div>
                          <p className="attendance-link">{attendanceOverview.currentWeek.session.deepLink}</p>
                        </>
                      ) : (
                        <p className="reason-text">No attendance QR has been generated for this Sabha yet.</p>
                      )}
                    </div>
                    {attendanceOverview.currentWeek.session?.deepLink && (
                      <img
                        className="attendance-qr"
                        src={getAttendanceQrUrl(attendanceOverview.currentWeek.session.deepLink)}
                        alt="Attendance QR code"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <p className="reason-text">Create a Sabha week first to enable attendance.</p>
              )}
            </div>

            {selectedAttendanceWeek && (
              <>
                <div className="attendance-filter-grid">
                  <button
                    type="button"
                    className={`attendance-filter-card ${attendanceFilter === ATTENDANCE_FILTERS.present ? "attendance-filter-card--active attendance-filter-card--success" : ""}`}
                    onClick={() => setAttendanceFilter((current) => current === ATTENDANCE_FILTERS.present ? ATTENDANCE_FILTERS.all : ATTENDANCE_FILTERS.present)}
                  >
                    <span>Present</span>
                    <strong>{selectedAttendanceWeek.counts.present}</strong>
                  </button>
                  <button
                    type="button"
                    className={`attendance-filter-card ${attendanceFilter === ATTENDANCE_FILTERS.late ? "attendance-filter-card--active attendance-filter-card--warm" : ""}`}
                    onClick={() => setAttendanceFilter((current) => current === ATTENDANCE_FILTERS.late ? ATTENDANCE_FILTERS.all : ATTENDANCE_FILTERS.late)}
                  >
                    <span>Late</span>
                    <strong>{selectedAttendanceWeek.counts.late}</strong>
                  </button>
                  <button
                    type="button"
                    className={`attendance-filter-card ${attendanceFilter === ATTENDANCE_FILTERS.absent ? "attendance-filter-card--active attendance-filter-card--danger" : ""}`}
                    onClick={() => setAttendanceFilter((current) => current === ATTENDANCE_FILTERS.absent ? ATTENDANCE_FILTERS.all : ATTENDANCE_FILTERS.absent)}
                  >
                    <span>Absent</span>
                    <strong>{selectedAttendanceWeek.counts.absent}</strong>
                  </button>
                  <button
                    type="button"
                    className={`attendance-filter-card ${attendanceFilter === ATTENDANCE_FILTERS.unchecked ? "attendance-filter-card--active" : ""}`}
                    onClick={() => setAttendanceFilter((current) => current === ATTENDANCE_FILTERS.unchecked ? ATTENDANCE_FILTERS.all : ATTENDANCE_FILTERS.unchecked)}
                  >
                    <span>Not checked in</span>
                    <strong>{selectedAttendanceWeek.counts.unchecked}</strong>
                  </button>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <h3>Attendance Roster</h3>
                    <p>
                      {selectedAttendanceWeek.sabhaDate} at {selectedAttendanceWeek.sabhaTime}
                      {attendanceFilter !== ATTENDANCE_FILTERS.all ? ` · Showing ${attendanceFilter === ATTENDANCE_FILTERS.unchecked ? "Not checked in" : attendanceFilter} first` : ""}
                    </p>
                  </div>
                  <div className="attendance-toolbar">
                    <button type="button" className="ghost" onClick={() => handleGenerateAttendanceSession(selectedAttendanceWeek.id, true)}>
                      Refresh QR Token
                    </button>
                    <button type="button" className="ghost" onClick={() => handleSendAttendanceReport(selectedAttendanceWeek.id)}>
                      Send Attendance Report
                    </button>
                    <button type="button" className="primary" onClick={handleSaveAttendance}>
                      Save Attendance Changes
                    </button>
                  </div>
                  <div className="table-list attendance-roster-list">
                    {filteredAttendanceRecords.map((record) => (
                      <div key={record.personId} className="person-row attendance-row">
                        <div>
                          <strong>{record.personName}</strong>
                          <p>{record.center} · BKMS/MIS {record.bkmsId}</p>
                          <p>
                            {record.checkedInAt
                              ? `Checked in ${new Date(record.checkedInAt).toLocaleString()}`
                              : "No check-in recorded yet"}
                          </p>
                        </div>
                        <div className="attendance-controls">
                          <span className={`badge ${getAttendanceStatusTone(attendanceDraft[record.personId]?.status || record.status)}`}>
                            {getAttendanceStatusLabel({ status: attendanceDraft[record.personId]?.status || record.status })}
                          </span>
                          <select
                            value={attendanceDraft[record.personId]?.status || ""}
                            onChange={(e) => updateAttendanceDraft(record.personId, "status", e.target.value)}
                          >
                            <option value="">Not checked in yet</option>
                            <option value="Present">Present</option>
                            <option value="Late">Late</option>
                            <option value="Absent">Absent</option>
                          </select>
                          <input
                            placeholder="Optional attendance note"
                            value={attendanceDraft[record.personId]?.notes || ""}
                            onChange={(e) => updateAttendanceDraft(record.personId, "notes", e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="panel">
              <div className="panel-header">
                <h3>Previous Weeks</h3>
                <p>Open an older Sabha week when you need to review or edit attendance.</p>
              </div>
              <div className="history-list">
                {attendanceWeeks.map((week) => (
                  <button
                    type="button"
                    key={week.id}
                    className={`history-card history-card--button ${selectedAttendanceWeek?.id === week.id ? "history-card--active" : ""}`}
                    onClick={() => handleSelectAttendanceWeek(week.id)}
                  >
                    <strong>{week.sabhaDate}</strong>
                    <p>{week.sabhaTime}</p>
                    <div className="history-roles">
                      <span className="badge badge--success">P {week.counts.present}</span>
                      <span className="badge badge--warm">L {week.counts.late}</span>
                      <span className="badge badge--danger">A {week.counts.absent}</span>
                      <span className="badge badge--outline">N {week.counts.unchecked}</span>
                    </div>
                    <div className="history-actions">
                      <span className={`badge ${week.session?.reportSentAt ? "badge--success" : "badge--outline"}`}>
                        {week.session?.reportSentAt ? "Report sent" : "Report not sent"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === TABS.summary && (
          <section className="tab-panel tab-panel--summary">
            <div className="panel">
              <div className="panel-header">
                <h3>Summary Destination</h3>
                <p>
                  {overview?.summaryChat
                    ? `Detected group chat: ${overview.summaryChat.title}`
                    : "The SF Kishore Mandal group has not been connected yet. Send /setsummarygroup inside that Telegram group."}
                </p>
              </div>
              <span className={`badge ${overview?.summaryChat ? "badge--success" : "badge--danger"}`}>
                {overview?.summaryChat ? "Group connected" : "Group not connected"}
              </span>
            </div>

            <form className="panel form-grid" onSubmit={handleSendGroupMessage}>
              <div className="panel-header">
                <h3>Message SF Kishore Mandal</h3>
                <p>Send a direct text message into the connected group as the bot.</p>
              </div>
              <label className="full-width">
                Group message
                <textarea
                  rows="4"
                  value={groupMessageState.message}
                  onChange={(e) => setGroupMessageState({ message: e.target.value })}
                  placeholder="Write the message you want to post in SF Kishore Mandal."
                  required
                />
              </label>
              <button type="submit" className="primary">Send Message To Group</button>
            </form>

            <form className="panel form-grid" onSubmit={handleSaveSummary}>
              <div className="panel-header">
                <h3>Sabha Summary</h3>
                <p>Choose a Sabha week, customize the message, save it, and send it to the group after Sabha.</p>
              </div>
              <label>
                Sabha week
                <select
                  value={summaryForm.sabhaWeekId}
                  onChange={(e) => {
                    const selectedWeek = history.find((week) => String(week.id) === e.target.value);
                    if (selectedWeek) {
                      setCurrentWeek(selectedWeek);
                      hydrateSummary(selectedWeek);
                    } else {
                      setSummaryForm(emptySummaryState);
                    }
                  }}
                  required
                >
                  <option value="">Choose Sabha week</option>
                  {history.map((week) => (
                    <option key={week.id} value={week.id}>
                      {week.sabhaDate} at {week.sabhaTime}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-width">
                Summary message
                <textarea
                  rows="5"
                  value={summaryForm.messageText}
                  onChange={(e) => updateSummaryForm("messageText", e.target.value)}
                  required
                />
              </label>
              <div className="summary-actions">
                <span className={`badge ${summaryForm.sentAt ? "badge--success" : ""}`}>
                  {getSummarySendLabel(summaryForm)}
                </span>
                <button type="submit" className="ghost">Save Summary</button>
                <button type="button" className="primary" onClick={handleSendSummary}>Send Summary To Group</button>
              </div>
            </form>
            <details className="panel history-details">
              <summary>Summary send history</summary>
              <div className="reason-list">
                {(summaryForm.sendHistory || []).length === 0 && (
                  <p className="reason-text">No summary sends yet.</p>
                )}
                {(summaryForm.sendHistory || []).map((entry) => (
                  <p key={entry.id} className="reason-text">
                    {new Date(entry.sentAt).toLocaleString()} · {entry.messageText}
                  </p>
                ))}
              </div>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
