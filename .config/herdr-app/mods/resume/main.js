// Brings agents back after a reboot or crash. While they run, it remembers
// each Claude Code and Codex session as a label on its terminal. herdr-core
// keeps the label when it replaces a lost program with a fresh shell; the
// `run` command (ctrl-shift-r) then types the resume command into each such
// shell that sits idle at its prompt. Quitting an agent on purpose forgets it.
// A resume that gives up is not offered again, only run again by hand.
// Only kept terminals (your tabs) come back as shells, so only they count.
// The sessions waiting to come back are shared as "resume.waiting" for the
// sidebar, which resumes or forgets one through "resume.action".
// Draws nothing.

import { View, div } from "gpui-kit";
import { terminals, spaces, hc, exec, home, readTextFile, notify, nextCommand, shared, setShared } from "herdr";

const FLAG_VALUE_RE = /=(.*)/s;
const UNSAFE_SHELL_QUOTE_RE = /['\u0000-\u001f]/;
const NON_ALPHANUMERIC_RE = /[^A-Za-z0-9]/g;

const LEADING_HYPHEN_RE = /^-/;

const NAME = "resume";
const LABEL = "resume";
const EVERY = 20 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const SEEN = "resume.lost"; // when each lost session was first seen
export const WAITING = "resume.waiting";
// What the sidebar asked for: { kind: "resume" | "forget", addresses, at }.
export const ACTION = "resume.action";
const ACTION_MS = 10 * 1000;
// A label written with hc takes about 0.65 s to show; a terminal just resumed
// or forgotten stays off the shared list this long, so a watch can't bring it back.
const HANDLED_MS = 30 * 1000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Flags worth carrying over: 0 for a switch, 1 for one value, 2 for every
// value up to the next flag. Nothing that loads code or config (no
// --settings, --mcp-config, --plugin-dir, -c, --profile).
const CARRY = {
  claude: { "--model": 1, "--permission-mode": 1, "--effort": 1, "--add-dir": 2 },
  codex: { "--no-daemon": 0, "--sandbox": 1, "-s": 1, "--model": 1, "-m": 1, "--ask-for-approval": 1, "-a": 1 },
};
const VALUE = /^[A-Za-z0-9._:\[\]-]+$/;
// A folder for --add-dir: no quote or control character, so it can be single-quoted.
const FOLDER = /^[^-'\u0000-\u001f][^'\u0000-\u001f]*$/;
const PATHS = new Set(["--add-dir"]);
// A second Ctrl+Shift+R while the agent is still starting must not type the command again.
const RETRY_AFTER = 60 * 1000;
const SHELLS = new Set(["zsh", "bash", "fish", "sh", "dash", "nu"]);

const base = (path) => (path ?? "").split("/").pop().replace(LEADING_HYPHEN_RE, "");
const program = (t) => base(t.foreground?.argv?.[0]) || t.foreground?.name;
// A shell at its prompt, not a program running in it.
const idle = (t) => SHELLS.has(program(t));

// Turned off in the Mods popup (ctrl-shift-m).
const off = () => (shared("mods.off") ?? []).includes(NAME);

function parse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// Only allowlisted flags with plain values survive, on the way in and out.
function carry(agent, argv) {
  const allowed = CARRY[agent] ?? {};
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(FLAG_VALUE_RE);
    if (!Object.prototype.hasOwnProperty.call(allowed, flag)) continue;
    if (allowed[flag] === 0) { out.push(flag); continue; }
    const ok = (value) => (PATHS.has(flag) ? FOLDER : VALUE).test(value);
    if (allowed[flag] === 1 || inline !== undefined) {
      const value = inline ?? argv[++i];
      if (value !== undefined && ok(value)) out.push(flag, value);
      continue;
    }
    const values = [];
    while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) values.push(argv[++i]);
    if (values.length && values.every(ok)) out.push(flag, ...values);
  }
  return out;
}

// carry() only lets through words that are plain or free of quotes.
const quote = (word) => (VALUE.test(word) ? word : `'${word}'`);

// When a process started, as ps prints it, or null.
async function started(pid) {
  const r = await exec("ps", ["-o", "lstart=", "-p", String(pid)]).catch(() => null);
  return r?.code === 0 ? r.stdout.trim() || null : null;
}

// Whether herdr-core replaced the program the agent ran in. Pids start over
// after a reboot, so a shell with the old pid must also have the old start time.
async function replaced(t, rec) {
  if (t.pid !== rec.shell) return true;
  if (!rec.since) return false;
  const now = await started(t.pid);
  return Boolean(now) && now !== rec.since;
}

// Claude Code writes ~/.claude/sessions/<pid>.json for each running session.
async function claudeSession(pid) {
  const s = parse((await readTextFile(`${home()}/.claude/sessions/${pid}.json`)) ?? "");
  return s?.sessionId && ID.test(s.sessionId) ? { session: s.sessionId, cwd: s.cwd } : null;
}

// Codex holds a lock file for each thread it writes, named by the thread's id.
// Its own conversation is the one whose session file says a person started it;
// the others are helpers (a reviewer, sub-agents). Linux only: elsewhere, and
// before the first message, there is nothing to find and the title decides.
const userThreads = new Map(); // id → whether it is a person's conversation
const shellStarts = new Map(); // pid → start time, for the shells agents run in

async function lockedThreads(pid) {
  const r = await exec("find", [`/proc/${pid}/fd`, "-lname", "*/thread-writer-locks/*.lock", "-printf", "%l\\n"]).catch(() => null);
  if (r?.code !== 0) return [];
  return [...new Set(r.stdout.split("\n").map((l) => base(l).replace(/\.lock$/, "")).filter((id) => ID.test(id)))];
}

async function isUserThread(id) {
  if (userThreads.has(id)) return userThreads.get(id);
  const found = await exec("find", [`${home()}/.codex/sessions`, "-name", `rollout-*-${id}.jsonl`, "-print", "-quit"]).catch(() => null);
  const path = found?.code === 0 ? found.stdout.trim() : "";
  // No session file yet: it may still get one, so nothing is remembered.
  if (!path) return false;
  const head = await exec("head", ["-c", "8192", path]).catch(() => null);
  const user = head?.code === 0 && head.stdout.includes('"thread_source":"user"');
  userThreads.set(id, user);
  return user;
}

async function codexByLock(pid) {
  const ids = [];
  for (const id of await lockedThreads(pid)) if (await isUserThread(id)) ids.push(id);
  return ids.length === 1 ? { session: ids[0] } : null;
}

// Codex titles its terminal "<thread name> | <folder>"; the index maps
// thread names to ids. A name used twice is ambiguous, so it is skipped.
const readCodexIndex = () => readTextFile(`${home()}/.codex/session_index.jsonl`);

async function codexSession(title, readIndex = readCodexIndex, pid = null) {
  if (pid) {
    const locked = await codexByLock(pid);
    if (locked) return locked;
  }
  const name = (title ?? "").split(" | ")[0].trim();
  if (!name) return null;
  const text = (await readIndex()) ?? "";
  const ids = new Set();
  for (const line of text.split("\n")) {
    const e = parse(line);
    if (e?.thread_name === name && ID.test(e.id ?? "")) ids.add(e.id);
  }
  return ids.size === 1 ? { session: [...ids][0] } : null;
}

function valid(rec) {
  return rec && (rec.agent === "claude" || rec.agent === "codex") && ID.test(rec.session ?? "")
    && typeof rec.cwd === "string" && rec.cwd.startsWith("/") && !UNSAFE_SHELL_QUOTE_RE.test(rec.cwd);
}

// Lost: herdr-core replaced the process the agent ran in, and the new
// shell sits idle at its prompt.
async function lost(t) {
  const rec = parse(t.labels?.[LABEL] ?? "");
  return valid(rec) && t.state === "live" && idle(t) && (await replaced(t, rec)) ? rec : null;
}

// A resume was typed and the agent is back at the shell: it gave up (the
// folder is gone, the session can't be found). Only asked for by hand again.
const tried = (rec, now = Date.now()) => Number.isFinite(rec.tried) && rec.tried <= now;

// Claude writes its session file before the first message, its transcript
// only after; without a transcript there is nothing to resume.
const transcriptPath = (rec) => `${home()}/.claude/projects/${rec.cwd.replace(NON_ALPHANUMERIC_RE, "-")}/${rec.session}.jsonl`;

async function transcript(rec) {
  if (rec.agent !== "claude") return true;
  const r = await exec("test", ["-f", transcriptPath(rec)]).catch(() => ({ code: 1 }));
  return r.code === 0;
}

// When the agent last wrote its conversation (ms), or null.
async function lastActive(rec) {
  const path = rec.agent === "claude" ? transcriptPath(rec) : null;
  if (!path) return null;
  const r = await exec("stat", ["-c", "%Y", path]).catch(() => null);
  const s = Number(r?.code === 0 ? r.stdout.trim() : NaN);
  return Number.isFinite(s) && s > 0 ? s * 1000 : null;
}

// The space and tab the terminal shows in.
function where(t) {
  const space = spaces().find((s) => s.id === t.labels?.["herdr.space"]);
  const tab = space?.tabs.find((tab) => tab.id === t.labels?.["herdr.tab"]);
  return { space: space?.name ?? null, tab: tab?.name ?? null };
}

// "daily · Formspark".
function place(t) {
  const { space, tab } = where(t);
  if (space && tab) return `${space} · ${tab}`;
  return space ?? "a terminal outside your tabs";
}

function command(rec) {
  const flags = carry(rec.agent, rec.flags ?? []).filter((flag) => flag !== "--no-daemon");
  const words = rec.agent === "claude"
    ? ["claude", ...flags, "--resume", rec.session]
    : ['"$HOME/scripts/herdr-codex"', "resume", ...flags, rec.session];
  return `cd '${rec.cwd}' && ${words.map((w, i) => (rec.agent === "codex" && i === 0 ? w : quote(w))).join(" ")}`;
}

export default class Resume extends View {
  init(_props, cx) {
    cx.timer.every(EVERY, (cx) => cx.spawn(async () => this.watch()));
    cx.spawn(async () => this.watch());
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (off()) continue;
        try {
          if (c === "run") await this.resume();
          else if (c === "act") await this.act();
        } catch (e) { notify({ title: "Resume", body: String(e), level: "error" }); }
      }
    });
  }

  // Record running agents; forget ones whose terminal is back at its own shell.
  async watch() {
    if (this.busy || off()) return;
    this.busy = true;
    try {
      const seen = parse(localStorage.getItem(SEEN) ?? "") ?? {};
      const now = Date.now();
      this.kept = new Set();
      const resumable = [];
      const waiting = [];
      const busy = new Map();
      let codexIndex;
      const readIndex = () => codexIndex ??= readCodexIndex();
      const results = await Promise.allSettled(terminals().map(async (t) => {
        if (!t.keep || t.state !== "live" || !t.foreground) return;
        const saved = t.labels?.[LABEL];
        const prog = program(t);
        const agent = prog === "claude" ? "claude" : prog === "codex" ? "codex" : null;
        if (agent) {
          const found = agent === "claude" ? await claudeSession(t.foreground.pid) : await codexSession(t.title, readIndex, t.foreground.pid);
          if (!found) return;
          const rec = {
            agent,
            session: found.session,
            cwd: found.cwd ?? t.foreground.cwd,
            flags: carry(agent, (t.foreground.argv ?? []).slice(1)),
            shell: t.pid,
          };
          if (!shellStarts.has(t.pid)) shellStarts.set(t.pid, await started(t.pid));
          if (shellStarts.get(t.pid)) rec.since = shellStarts.get(t.pid);
          const text = JSON.stringify(rec);
          if (valid(rec) && saved !== text) await hc(["label", t.address, `${LABEL}=${text}`]);
        } else if (saved) {
          const rec = parse(saved);
          if (await this.forget(t, rec, seen, now, busy)) await hc(["label", t.address, `${LABEL}=`]);
          else if (!tried(rec) && (await lost(t))) {
            resumable.push(`${t.address}:${rec.session}`);
            waiting.push({ address: t.address, agent: rec.agent, session: rec.session, cwd: rec.cwd, ...where(t), active: await lastActive(rec) });
          }
        }
      }));
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
      this.lastBusy = busy;
      localStorage.setItem(SEEN, JSON.stringify(Object.fromEntries(Object.entries(seen).filter(([k]) => this.kept.has(k)))));
      this.share(waiting);
      this.nudge(resumable.filter((k) => !this.handled?.has(k.slice(0, k.lastIndexOf(":")))));
    } finally {
      this.busy = false;
    }
  }

  // Whether a saved session should go. Kept only while it is truly lost:
  // its process was replaced, the new shell is unused, the transcript is
  // there, and it was lost less than a day ago.
  async forget(t, rec, seen, now, busy) {
    if (!valid(rec)) return true;
    if (!(await replaced(t, rec))) return idle(t); // the agent was quit on purpose
    if (!idle(t)) {
      // The recovered shell runs something else; twice in a row, so that a
      // prompt helper caught mid-draw does not count.
      const prog = program(t);
      busy.set(t.address, prog);
      return this.lastBusy?.get(t.address) === prog;
    }
    if (!(await transcript(rec))) return true;
    const key = `${t.address}:${rec.session}`;
    seen[key] ??= now;
    this.kept.add(key);
    return now - seen[key] > DAY;
  }

  share(waiting) {
    const now = Date.now();
    for (const [a, at] of this.handled ?? []) if (now - at > HANDLED_MS) this.handled.delete(a);
    waiting = waiting.filter((w) => !this.handled?.has(w.address));
    waiting.sort((x, y) => (y.active ?? 0) - (x.active ?? 0) || x.address.localeCompare(y.address));
    if (JSON.stringify(waiting) !== JSON.stringify(shared(WAITING) ?? [])) setShared(WAITING, waiting);
  }

  // Drops these terminals from the shared list straight away, before the next watch.
  unshare(addresses) {
    const gone = new Set(addresses);
    const now = Date.now();
    this.handled ??= new Map();
    for (const a of addresses) this.handled.set(a, now);
    this.share((shared(WAITING) ?? []).filter((w) => !gone.has(w.address)));
  }

  // What the sidebar asked for.
  async act() {
    const a = shared(ACTION);
    if (!a || Date.now() - a.at > ACTION_MS || !Array.isArray(a.addresses)) return;
    setShared(ACTION, null);
    if (a.kind === "resume") await this.resume(new Set(a.addresses));
    else if (a.kind === "forget") await this.forgetAll(a.addresses);
  }

  // Forgets the saved session of each terminal; the shell stays as it is.
  async forgetAll(addresses) {
    this.unshare(addresses);
    const failed = [];
    for (const address of addresses) {
      const r = await hc(["label", address, `${LABEL}=`]).catch((e) => ({ code: 1, stderr: String(e) }));
      if (r.code !== 0) failed.push(address);
    }
    if (failed.length) notify({ title: "Couldn't forget a session", body: failed.join(", "), level: "error" });
  }

  // Says when sessions newly become resumable; one going away says nothing.
  nudge(resumable) {
    const fresh = resumable.filter((k) => !this.told?.has(k));
    this.told = new Set(resumable);
    if (!fresh.length) return;
    const n = resumable.length;
    notify({
      title: `${n} agent${n === 1 ? "" : "s"} can be resumed`,
      body: "Press Ctrl+Shift+R, or click here",
      level: "info",
      action: { name: "resume.run" },
    });
  }

  // Every lost session, or only those of these terminals.
  async resume(only = null) {
    const done = [], skipped = [], seen = [];
    const now = Date.now();
    if (only) this.unshare([...only]);
    for (const t of terminals()) {
      if (only && !only.has(t.address)) continue;
      const rec = await lost(t);
      if (!rec) continue;
      seen.push(t.address);
      const at = place(t);
      if (tried(rec, now) && now - rec.tried < RETRY_AFTER) { skipped.push(`${at}: still starting`); continue; }
      if (!(await transcript(rec))) { skipped.push(`${at}: transcript gone`); continue; }
      // Marked first, so the nudge stops and a second press can't type it twice.
      const mark = await hc(["label", t.address, `${LABEL}=${JSON.stringify({ ...rec, tried: now })}`]);
      if (mark.code !== 0) { skipped.push(`${at}: ${mark.stderr.trim() || "label failed"}`); continue; }
      const r = await hc(["send", t.address, command(rec)]);
      if (r.code !== 0) { skipped.push(`${at}: ${r.stderr.trim() || "send failed"}`); continue; }
      done.push(at);
      // hc send can wait seconds for a busy terminal; each row goes as its turn comes.
      this.unshare([t.address]);
    }
    // The next watch brings back any that are still waiting.
    this.unshare(seen);
    const n = done.length;
    notify({
      title: n ? `Resumed ${n} agent${n === 1 ? "" : "s"}` : "Nothing to resume",
      body: [done.join(", "), skipped.length ? `Not resumed: ${skipped.join("; ")}` : ""].filter(Boolean).join(" · ") || undefined,
      level: skipped.length ? "warning" : n ? "success" : "info",
    });
  }

  render() {
    return div();
  }
}
