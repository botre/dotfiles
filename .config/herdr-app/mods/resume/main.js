// Brings agents back after a reboot or crash. While they run, it remembers
// each Claude Code and Codex session as a label on its terminal. herdr-core
// keeps the label when it replaces a lost program with a fresh shell; the
// `run` command (ctrl-shift-r) then types the resume command into each such
// shell that sits idle at its prompt. Quitting an agent on purpose forgets it.
// Only kept terminals (your tabs) come back as shells, so only they count.
// Draws nothing.

import { View, div } from "gpui-kit";
import { terminals, spaces, hc, exec, home, readTextFile, notify, nextCommand, shared } from "herdr";

const FLAG_VALUE_RE = /=(.*)/s;
const UNSAFE_SHELL_QUOTE_RE = /['\u0000-\u001f]/;
const NON_ALPHANUMERIC_RE = /[^A-Za-z0-9]/g;

const LEADING_HYPHEN_RE = /^-/;

const NAME = "resume";
const LABEL = "resume";
const EVERY = 20 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const SEEN = "resume.lost"; // when each lost session was first seen
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Flags worth carrying over. Nothing that loads code or config (no
// --settings, --mcp-config, --plugin-dir, -c, --profile).
const CARRY = {
  claude: { "--model": 1, "--permission-mode": 1, "--effort": 1 },
  codex: { "--no-daemon": 0, "--sandbox": 1, "-s": 1, "--model": 1, "-m": 1, "--ask-for-approval": 1, "-a": 1 },
};
const VALUE = /^[A-Za-z0-9._:\[\]-]+$/;
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
    if (!(flag in allowed)) continue;
    if (allowed[flag] === 0) { out.push(flag); continue; }
    const value = inline ?? argv[++i];
    if (value !== undefined && VALUE.test(value)) out.push(flag, value);
  }
  return out;
}

// Claude Code writes ~/.claude/sessions/<pid>.json for each running session.
async function claudeSession(pid) {
  const s = parse((await readTextFile(`${home()}/.claude/sessions/${pid}.json`)) ?? "");
  return s?.sessionId && ID.test(s.sessionId) ? { session: s.sessionId, cwd: s.cwd } : null;
}

// Codex titles its terminal "<thread name> | <folder>"; the index maps
// thread names to ids. A name used twice is ambiguous, so it is skipped.
const readCodexIndex = () => readTextFile(`${home()}/.codex/session_index.jsonl`);

async function codexSession(title, readIndex = readCodexIndex) {
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
function lost(t) {
  const rec = parse(t.labels?.[LABEL] ?? "");
  return valid(rec) && t.state === "live" && t.pid !== rec.shell && idle(t) ? rec : null;
}

// Claude writes its session file before the first message, its transcript
// only after; without a transcript there is nothing to resume.
async function transcript(rec) {
  if (rec.agent !== "claude") return true;
  const dir = rec.cwd.replace(NON_ALPHANUMERIC_RE, "-");
  const r = await exec("test", ["-f", `${home()}/.claude/projects/${dir}/${rec.session}.jsonl`]).catch(() => ({ code: 1 }));
  return r.code === 0;
}

// "daily · Formspark": the space and tab the terminal shows in.
function place(t) {
  const space = spaces().find((s) => s.id === t.labels?.["herdr.space"]);
  const tab = space?.tabs.find((tab) => tab.id === t.labels?.["herdr.tab"]);
  if (space && tab) return `${space.name} · ${tab.name}`;
  return space?.name ?? "a terminal outside your tabs";
}

function command(rec) {
  const flags = carry(rec.agent, rec.flags ?? []).filter((flag) => flag !== "--no-daemon");
  const words = rec.agent === "claude"
    ? ["claude", ...flags, "--resume", rec.session]
    : ['"$HOME/scripts/herdr-codex"', "resume", ...flags, rec.session];
  return `cd '${rec.cwd}' && ${words.join(" ")}`;
}

export default class Resume extends View {
  init(_props, cx) {
    cx.timer.every(EVERY, (cx) => cx.spawn(async () => this.watch()));
    cx.spawn(async () => this.watch());
    cx.spawn(async () => {
      for (;;) {
        if ((await nextCommand()) === "run" && !off()) await this.resume();
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
      const busy = new Map();
      let codexIndex;
      const readIndex = () => codexIndex ??= readCodexIndex();
      const results = await Promise.allSettled(terminals().map(async (t) => {
        if (!t.keep || t.state !== "live" || !t.foreground) return;
        const saved = t.labels?.[LABEL];
        const prog = program(t);
        const agent = prog === "claude" ? "claude" : prog === "codex" ? "codex" : null;
        if (agent) {
          const found = agent === "claude" ? await claudeSession(t.foreground.pid) : await codexSession(t.title, readIndex);
          if (!found) return;
          const rec = {
            agent,
            session: found.session,
            cwd: found.cwd ?? t.foreground.cwd,
            flags: carry(agent, (t.foreground.argv ?? []).slice(1)),
            shell: t.pid,
          };
          const text = JSON.stringify(rec);
          if (valid(rec) && saved !== text) await hc(["label", t.address, `${LABEL}=${text}`]);
        } else if (saved) {
          const rec = parse(saved);
          if (await this.forget(t, rec, seen, now, busy)) await hc(["label", t.address, `${LABEL}=`]);
          else if (lost(t)) resumable.push(`${t.address}:${rec.session}`);
        }
      }));
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
      this.lastBusy = busy;
      localStorage.setItem(SEEN, JSON.stringify(Object.fromEntries(Object.entries(seen).filter(([k]) => this.kept.has(k)))));
      this.nudge(resumable);
    } finally {
      this.busy = false;
    }
  }

  // Whether a saved session should go. Kept only while it is truly lost:
  // its process was replaced, the new shell is unused, the transcript is
  // there, and it was lost less than a day ago.
  async forget(t, rec, seen, now, busy) {
    if (!valid(rec)) return true;
    if (t.pid === rec.shell) return idle(t); // the agent was quit on purpose
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

  // Says once per set of lost sessions that they can come back.
  nudge(resumable) {
    const key = [...resumable].sort().join(" ");
    if (key === this.told) return;
    this.told = key;
    if (!resumable.length) return;
    const n = resumable.length;
    notify({
      title: `${n} agent${n === 1 ? "" : "s"} can be resumed`,
      body: "Press Ctrl+Shift+R, or click here",
      level: "info",
      action: { name: "resume.run" },
    });
  }

  async resume() {
    const done = [], skipped = [];
    for (const t of terminals()) {
      const rec = lost(t);
      if (!rec) continue;
      const where = place(t);
      if (!(await transcript(rec))) { skipped.push(`${where}: transcript gone`); continue; }
      const r = await hc(["send", t.address, command(rec)]);
      if (r.code !== 0) { skipped.push(`${where}: ${r.stderr.trim() || "send failed"}`); continue; }
      done.push(where);
    }
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
