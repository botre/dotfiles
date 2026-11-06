// Settle and snooze, kept as labels on each agent's terminal so they last as
// long as the terminal and every window can read them:
//   inbox.settled=<ms>:<turn>  put away by hand; a later turn brings it back
//   inbox.snoozed=<wake ms>    put away until then
// A label written with hc takes about 0.65 s to come back in terminals(), so
// what was just written is shared as pending and shown straight away.

export const SETTLED = "inbox.settled";
export const SNOOZED = "inbox.snoozed";
export const PENDING = "agent-list.pending";
export const PENDING_MS = 5000;
// What a menu asked the sidebar to do; it runs there, since a popup's tasks
// end when it closes.
export const ACTION = "agent-list.action";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]+/g;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseSettled(value) {
  const m = /^(\d+):(\d+)$/.exec(value ?? "");
  return m ? { at: Number(m[1]), turn: Number(m[2]) } : null;
}

export function parseSnoozed(value) {
  return /^\d+$/.test(value ?? "") ? Number(value) : null;
}

// A label as shown now: what was just written, else what the core has.
export function labelOf(terminal, key, pending, now = Date.now()) {
  const p = pending?.[terminal?.address];
  if (p && Object.prototype.hasOwnProperty.call(p, key) && now - p.at < PENDING_MS) return p[key];
  return terminal?.labels?.[key] ?? "";
}

// The pending map with these fields for `address` added and stale entries dropped.
export function withPending(pending, address, fields, now = Date.now()) {
  const kept = Object.fromEntries(Object.entries(pending ?? {}).filter(([, p]) => now - p.at < PENDING_MS));
  kept[address] = { ...(kept[address] ?? {}), ...fields, at: now };
  return kept;
}

function at(now, days, hour) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

// The snooze choices, soonest first, one per wake minute. Spans count from
// `now`, so the menu asks again at the click.
export function presets(now = Date.now()) {
  const day = new Date(now).getDay();
  const list = [
    { id: "hour", label: "In 1 hour", wake: now + HOUR },
    { id: "hours", label: "In 3 hours", wake: now + 3 * HOUR },
    { id: "evening", label: "This evening", wake: at(now, 0, 18) },
    { id: "tomorrow", label: "Tomorrow", wake: at(now, 1, 9) },
    { id: "week", label: "Next week", wake: at(now, ((8 - day) % 7) || 7, 9) },
  ].filter((p) => p.wake > now);
  const seen = new Set();
  return list.sort((x, y) => x.wake - y.wake).filter((p) => {
    const minute = Math.floor(p.wake / 60000);
    if (seen.has(minute)) return false;
    seen.add(minute);
    return true;
  });
}

const clock = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

// "18:00", "Tomorrow 9:00", "Mon 9:00", "Nov 12 9:00".
export function wakeLabel(wake, now = Date.now()) {
  const d = new Date(wake);
  const days = Math.round((at(wake, 0, 0) - at(now, 0, 0)) / DAY);
  if (days <= 0) return clock(d);
  if (days === 1) return `Tomorrow ${clock(d)}`;
  if (days < 7) return `${DAYS[d.getDay()]} ${clock(d)}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${clock(d)}`;
}

// One line that points another agent at this one. No control character,
// so pasting it can't submit the prompt.
export function reference({ address, title, cwd, home }) {
  const flat = (s) => String(s ?? "").replace(CONTROL, " ").replace(/"/g, "'").trim();
  const folder = home && cwd?.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const where = folder ? ` · ${flat(folder)}` : "";
  return `[agent ${flat(address)} "${flat(title) || flat(address)}"${where} · read it with: hc read ${flat(address)}]`;
}
