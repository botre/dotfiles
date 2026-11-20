// Session data for the Agents overview.
const PREFIX = /^[^\p{L}\p{N}]+/u;
const CONTROL = /[\u0000-\u001f\u007f]/g;
const INSPECTION_TTL = 90000;
const RECAP_PENDING = 180000;
const RECAP_INTERVAL = 900000;

export const text = (value) => typeof value === "string" ? value.replace(CONTROL, " ").trim().slice(0, 240) : "";
export const goalTitle = (value) => text(value).replace(PREFIX, "").split(" | ")[0].trim();
export const machineOf = (address) => address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null;
export const directoryName = (cwd) => text(cwd).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || cwd;

export const sameProcess = (record, terminal) => record?.pid === terminal.foreground?.pid && record?.createdAt === terminal.created_ms;

// The conversation the terminal's program is in: the one the transcript probe
// found for this process, else the one the resume mod saved.
export function currentSession(terminal) {
  const labels = terminal.labels ?? {};
  if (labels["herdr.session"] && labels["herdr.session.pid"] === String(terminal.foreground?.pid)) return labels["herdr.session"];
  try { return JSON.parse(labels.resume ?? "{}")?.session ?? null; } catch { return null; }
}

// Whether a label was written in the conversation running now, though by an
// earlier process of it (the session was resumed).
export const sameSession = (terminal, sessionKey) => {
  const stamp = terminal.labels?.[sessionKey];
  return Boolean(stamp) && stamp === currentSession(terminal);
};

// A label the terminal's current program, or its conversation, wrote: one from
// another conversation in the same terminal names other work.
const ownLabel = (terminal, key, pidKey) => {
  const author = terminal.labels?.[pidKey];
  const mine = !author || author === String(terminal.foreground?.pid) || sameSession(terminal, pidKey.replace(/pid$/, "session"));
  return mine ? goalTitle(terminal.labels?.[key]) : "";
};

// The observation the transcript probe made of this terminal's current process.
const ownObservation = (terminal, observation) => observation && observation.pid === terminal.foreground?.pid ? observation : null;

// A session's own name: Claude Code's /rename name, the title the agent
// published, the recap's title, then the agent's goal.
export function sessionName(terminal, observation, record = {}) {
  const seen = ownObservation(terminal, observation);
  return goalTitle(seen?.renamed)
    || ownLabel(terminal, "session.title", "session.title.pid")
    || goalTitle(seen?.recap?.title)
    || ownLabel(terminal, "summary.goal", "summary.pid") || text(record.goal);
}

// A recap asks for a title only when the session has no name of its own.
export function recapWantsTitle(terminal, observation) {
  return !goalTitle(ownObservation(terminal, observation)?.renamed) && !ownLabel(terminal, "session.title", "session.title.pid");
}

// A helper row's name: the session's own name, then the terminal name its
// parent gave it (often a code like `cx675`).
export function helperName(terminal, observation) {
  return sessionName(terminal, observation)
    || terminal.name || terminal.template || terminal.program?.name || terminal.address;
}

export function isAgent(terminal) {
  return terminal.state === "live" && Boolean(terminal.program?.agent || terminal.report?.app);
}

export function duration(ms) {
  if (!Number.isFinite(ms)) return "Not available";
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

// A short age with seconds under a minute: "12s", "4m", "1h 5m".
export function since(ms) {
  if (!Number.isFinite(ms)) return "";
  return ms < 60000 ? `${Math.max(0, Math.floor(ms / 1000))}s` : duration(ms);
}

// The dim line under an activity that says where it came from and how fresh it is.
export function activityMeta(row, now = Date.now()) {
  const age = row.updatedAt ? ` · ${since(now - row.updatedAt)} ago` : "";
  if (row.source === "live") return `${row.working ? "Live" : "Latest message"}${age}`;
  if (row.freshness === "current") return `Current · ${row.source === "recap" ? "recap" : row.source === "status" ? "status report" : "agent report"}`;
  if (row.inspectionError) return "Conversation unavailable";
  if (row.updatedAt) return `Reported${age}${row.freshness === "outdated" ? " · conversation changed" : ""}`;
  return "No current report";
}

export function clock(at, now = Date.now()) {
  if (!at) return "No update yet";
  const date = new Date(at), today = new Date(now);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return date.toDateString() === today.toDateString() ? time : `${date.getDate()}/${date.getMonth() + 1} ${time}`;
}

export function parseElapsed(value) {
  const match = value.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!match) return null;
  return ((Number(match[1] ?? 0) * 86400) + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4])) * 1000;
}

// Status changes do not mark activity changes. Only explicit summary updates do.
export function observe(terminal, previous, now, startedAt) {
  const pid = terminal.foreground?.pid;
  const before = sameProcess(previous, terminal) ? previous : {};
  const started = startedAt ?? before.startedAt ?? null;
  const observedAt = before.observedAt ?? now;
  const raw = Number(terminal.labels?.["summary.updated"]);
  const updatedAt = Number.isFinite(raw) && raw > 0 && raw * 1000 <= now + 5000 ? raw * 1000 : null;
  const author = terminal.labels?.["summary.pid"];
  const valid = updatedAt && (!author || author === String(pid)) && updatedAt >= (started ?? observedAt) - 2000;
  // A resumed conversation keeps its goal; its activity describes the earlier run.
  const resumed = !valid && Boolean(updatedAt) && sameSession(terminal, "summary.session");
  const goal = valid || resumed ? text(terminal.labels?.["summary.goal"]) : "";
  const activity = valid ? text(terminal.labels?.["summary.activity"]) : "";
  const sameActivity = before.activity === activity && before.goal === goal;
  // Herdr's turn counter counts finished turns; the one at a report says which turn it describes.
  const turn = Number.isInteger(terminal.turn) ? terminal.turn : undefined;
  const reportTurn = !valid ? undefined : updatedAt !== before.updatedAt ? turn : before.reportTurn;
  return {
    pid, createdAt: terminal.created_ms, startedAt: started, observedAt,
    goal, activity, updatedAt: valid ? updatedAt : null, reportTurn,
    activityAt: activity ? (sameActivity ? before.activityAt ?? updatedAt : updatedAt) : null,
  };
}

// An agent report is current while no newer turn has started: none has finished
// since, or one has (the one it was made in) and the agent is now at rest. The
// transcript changes on every tool call, so its time alone can't tell.
export function reportFreshness(terminal, record) {
  if (!Number.isInteger(record.reportTurn) || !Number.isInteger(terminal.turn)) return null;
  const finished = terminal.turn - record.reportTurn;
  const resting = terminal.status === "idle" || terminal.status === "done";
  return finished <= 0 || (finished === 1 && resting) ? "current" : "outdated";
}

// Whether the agent's own report still covers the conversation.
function agentFreshness(terminal, record, observation, inspected) {
  if (!record.updatedAt) return null;
  const byTurn = reportFreshness(terminal, record);
  if (byTurn) return byTurn;
  if (!inspected) return "unknown";
  return observation.conversationAt > record.updatedAt + 10000 ? "outdated" : "current";
}

// What the transcript shows without any model: the running tool action while a
// turn is underway, else the latest assistant sentence.
function liveActivity(observation) {
  const live = observation?.live;
  if (!live) return null;
  const working = Boolean(live.working);
  if (working && live.action) return { text: text(live.action), at: live.actionAt || null, working };
  if (live.message) return { text: text(live.message), at: live.messageAt || null, working };
  if (live.action) return { text: text(live.action), at: live.actionAt || null, working };
  return null;
}

// The agent's current report wins, then live transcript activity, then the
// newest of a recap, a status message, or an older report.
export function activityState(terminal, record, observation, now = Date.now()) {
  if (record.pid !== undefined && record.pid !== terminal.foreground?.pid) record = {};
  const inspected = Boolean(observation?.session && !observation.error && now - observation.checkedAt < INSPECTION_TTL);
  const recap = observation?.recap;
  const recapError = recap?.error || null;
  const own = record.activity ? agentFreshness(terminal, record, observation, inspected) : null;
  if (own === "current") {
    return { activity: record.activity, source: "agent", updatedAt: record.updatedAt, freshness: "current", activityAt: record.activityAt ?? null, working: false, recapError };
  }
  const live = inspected ? liveActivity(observation) : null;
  if (live?.text) {
    return { activity: live.text, source: "live", updatedAt: live.at, freshness: "current", activityAt: live.at, working: live.working, recapError };
  }
  const candidates = [];
  if (record.activity && record.updatedAt) candidates.push({ text: record.activity, at: record.updatedAt, coverage: record.updatedAt, source: "agent", freshness: own });
  const message = text(terminal.report?.msg);
  if (message) candidates.push({ text: message, at: terminal.status_ms || null, coverage: terminal.status_ms || 0, source: "status" });
  if (recap?.activity) candidates.push({ text: text(recap.activity), at: recap.at, coverage: recap.conversationAt || 0, source: "recap", stamp: recap.stamp });
  candidates.sort((a, b) => b.coverage - a.coverage);
  const selected = candidates[0];
  let freshness = selected?.freshness ?? "unknown";
  if (selected && selected.source !== "agent" && inspected) {
    freshness = selected.source === "recap"
      ? (selected.stamp === observation.stamp ? "current" : "outdated")
      : (observation.conversationAt > selected.coverage + 10000 ? "outdated" : "current");
  }
  return {
    activity: selected?.text || "No activity report yet", source: selected?.source || null,
    updatedAt: selected?.at || null, freshness, activityAt: null, working: false, recapError,
  };
}

// A session's goal: the agent's own, the recap's, then the first request. Not the
// session title: the Session column shows that already, so it would only repeat.
export function goalState(terminal, record, observation) {
  const seen = ownObservation(terminal, observation);
  return text(record.goal) || text(seen?.recap?.goal) || text(seen?.firstPrompt) || "No goal update yet";
}

// Recaps fill a missing goal or title. They wait for a quiet transcript after a
// report, skip an unchanged transcript, and run at most every fifteen minutes
// per session.
export function needsRecap(terminal, record, observation, now = Date.now()) {
  if (!observation?.session || observation.error || !observation.stamp) return false;
  if (now - observation.checkedAt >= INSPECTION_TTL) return false;
  if (record.pid !== undefined && record.pid !== terminal.foreground?.pid) record = {};
  const recap = observation.recap || {};
  if (recap.pendingAt && now - recap.pendingAt < RECAP_PENDING) return false;
  if (recap.at && now - recap.at < RECAP_INTERVAL) return false;
  if (record.updatedAt && now - record.updatedAt < 120000) return false;
  if (recap.stamp === observation.stamp && (recap.goal || recap.activity)) return false;
  const goalCurrent = Boolean(record.goal) && agentFreshness(terminal, record, observation, true) === "current";
  return !goalCurrent || recapWantsTitle(terminal, observation);
}

export function sessionRows(all, listed, spaces, history, panes = [], observations = {}, now = Date.now()) {
  const byAddress = new Map(listed.map((a) => [a.address, a]));
  const paneByAddress = new Map(panes.filter((p) => p.terminal).map((p) => [p.terminal, p]));
  return all.filter(isAgent).map((terminal) => {
    const agent = byAddress.get(terminal.address);
    const pane = paneByAddress.get(terminal.address);
    const machine = machineOf(terminal.address);
    const qualify = (id) => id && machine ? `${machine}/${id}` : id;
    const space = spaces.find((s) => s.id === (agent?.space ?? qualify(terminal.labels?.["herdr.space"])));
    const tab = space?.tabs.find((t) => t.id === (agent?.tab ?? qualify(terminal.labels?.["herdr.tab"])));
    const saved = history[terminal.address];
    const record = sameProcess(saved, terminal) ? saved : {};
    const observation = observations[terminal.address]?.pid === terminal.foreground?.pid ? observations[terminal.address] : null;
    const state = activityState(terminal, record, observation, now);
    return {
      address: terminal.address, parent: terminal.parent, machine,
      pane: pane?.pane ?? agent?.pane ?? null,
      tab: tab?.id ?? pane?.tab ?? agent?.tab ?? null,
      cwd: pane?.cwd ?? terminal.foreground?.cwd ?? terminal.cwd ?? null,
      branch: pane?.branch ?? null,
      name: terminal.name || tab?.name || sessionName(terminal, observation, record) || goalTitle(terminal.title) || terminal.address,
      space: space?.name || (terminal.parent ? "Sub-agent" : "Outside spaces"),
      status: agent?.status ?? terminal.status ?? "idle",
      program: terminal.program,
      goal: goalState(terminal, record, observation, tab),
      activity: state.activity, activityAt: state.activityAt, updatedAt: state.updatedAt,
      source: state.source, freshness: state.freshness, recapError: state.recapError, working: state.working,
      recapPending: observation?.recap?.pendingAt && now - observation.recap.pendingAt < RECAP_PENDING,
      conversationAt: observation?.conversationAt, inspectionError: observation?.error,
      routingLegacy: terminal.program?.key === "codex" && !(terminal.foreground?.argv || []).includes("--no-daemon"),
      startedAt: record.startedAt, reported: Boolean(state.source),
    };
  }).sort((a, b) => `${a.machine ?? ""}|${a.space}|${a.name}`.localeCompare(`${b.machine ?? ""}|${b.space}|${b.name}`));
}

export function groupSessions(rows, terminals) {
  const nodes = new Map(rows.map((row) => [row.address, { ...row, children: [], helpers: 0 }]));
  const byAddress = new Map(terminals.map((terminal) => [terminal.address, terminal]));
  const roots = [];
  for (const node of nodes.values()) {
    let owner = null;
    if (!node.pane && !node.tab) {
      const seen = new Set([node.address]);
      let address = node.address, parent = node.parent;
      while (parent) {
        const machine = machineOf(address);
        const key = machine && !parent.includes("/") ? `${machine}/${parent}` : parent;
        if (seen.has(key)) { owner = null; break; }
        seen.add(key);
        const ancestor = nodes.get(key);
        if (!owner && ancestor) owner = ancestor;
        if (ancestor?.pane || ancestor?.tab) break;
        address = key;
        parent = byAddress.get(key)?.parent ?? ancestor?.parent;
      }
    }
    if (owner) owner.children.push(node);
    else roots.push(node);
  }
  const count = (node) => {
    node.helpers = node.children.reduce((total, child) => total + 1 + count(child), 0);
    return node.helpers;
  };
  for (const root of roots) count(root);
  return roots;
}
