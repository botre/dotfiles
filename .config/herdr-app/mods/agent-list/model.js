// Session data shared by the sidebar hover cards and overview.
const PREFIX = /^[^\p{L}\p{N}]+/u;
const CONTROL = /[\u0000-\u001f\u007f]/g;

export const text = (value) => typeof value === "string" ? value.replace(CONTROL, " ").trim().slice(0, 240) : "";
export const goalTitle = (value) => text(value).replace(PREFIX, "").split(" | ")[0].trim();
export const machineOf = (address) => address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null;
export const directoryName = (cwd) => text(cwd).replace(/[\\/]+$/, "").split(/[\\/]/).pop() || cwd;

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
  const sameProcess = previous?.pid === pid && previous?.createdAt === terminal.created_ms;
  const before = sameProcess ? previous : {};
  const started = startedAt ?? before.startedAt ?? null;
  const observedAt = before.observedAt ?? now;
  const raw = Number(terminal.labels?.["summary.updated"]);
  const updatedAt = Number.isFinite(raw) && raw > 0 && raw * 1000 <= now + 5000 ? raw * 1000 : null;
  const valid = updatedAt && updatedAt >= (started ?? observedAt) - 2000;
  const goal = valid ? text(terminal.labels?.["summary.goal"]) : "";
  const activity = valid ? text(terminal.labels?.["summary.activity"]) : "";
  const sameActivity = before.activity === activity && before.goal === goal;
  return {
    pid, createdAt: terminal.created_ms, startedAt: started, observedAt,
    goal, activity, updatedAt: valid ? updatedAt : null,
    activityAt: activity ? (sameActivity ? before.activityAt ?? updatedAt : updatedAt) : null,
  };
}

export function sessionRows(all, listed, spaces, history, panes = []) {
  const byAddress = new Map(listed.map((a) => [a.address, a]));
  const paneByAddress = new Map(panes.filter((p) => p.terminal).map((p) => [p.terminal, p]));
  return all.filter(isAgent).map((terminal) => {
    const agent = byAddress.get(terminal.address);
    const pane = paneByAddress.get(terminal.address);
    const machine = machineOf(terminal.address);
    const qualify = (id) => id && machine ? `${machine}/${id}` : id;
    const space = spaces.find((s) => s.id === (agent?.space ?? qualify(terminal.labels?.["herdr.space"])));
    const tab = space?.tabs.find((t) => t.id === (agent?.tab ?? qualify(terminal.labels?.["herdr.tab"])));
    const record = history[terminal.address] ?? {};
    return {
      address: terminal.address, parent: terminal.parent, machine,
      cwd: pane?.cwd ?? terminal.foreground?.cwd ?? terminal.cwd ?? null,
      branch: pane?.branch ?? null,
      name: terminal.name || tab?.name || goalTitle(terminal.title) || terminal.address,
      space: space?.name || (terminal.parent ? "Sub-agent" : "Outside spaces"),
      status: agent?.status ?? terminal.status ?? "idle",
      program: terminal.program,
      goal: record.goal || goalTitle(terminal.title) || "No goal update yet",
      activity: record.activity || text(terminal.report?.msg) || "No activity update yet",
      activityAt: record.activityAt, updatedAt: record.updatedAt,
      startedAt: record.startedAt, reported: Boolean(record.activity),
    };
  }).sort((a, b) => `${a.machine ?? ""}|${a.space}|${a.name}`.localeCompare(`${b.machine ?? ""}|${b.space}|${b.name}`));
}
