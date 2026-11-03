// Brings agents back after a reboot or crash. While they run, it remembers
// each Claude Code and Codex session as a label on its terminal. herdr-core
// keeps the label when it replaces a lost program with a fresh shell; the
// `run` command (ctrl-shift-r) then types the resume command into each such
// shell that sits idle at its prompt. Quitting an agent on purpose forgets it.
// Only kept terminals (your tabs) come back as shells, so only they count.
// Draws nothing.

import { View, div } from "gpui-kit";
import { terminals, hc, exec, home, readTextFile, notify, nextCommand, shared } from "herdr";

const NAME = "resume";
const LABEL = "resume";
const EVERY = 20 * 1000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Flags worth carrying over. Nothing that loads code or config (no
// --settings, --mcp-config, --plugin-dir, -c, --profile).
const CARRY = {
  claude: { "--model": 1, "--permission-mode": 1, "--effort": 1 },
  codex: { "--no-daemon": 0, "--sandbox": 1, "-s": 1, "--model": 1, "-m": 1, "--ask-for-approval": 1, "-a": 1 },
};
const VALUE = /^[A-Za-z0-9._:\[\]-]+$/;
const SHELLS = new Set(["zsh", "bash", "fish", "sh", "dash", "nu"]);

const base = (path) => (path ?? "").split("/").pop().replace(/^-/, "");
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
    const [flag, inline] = argv[i].split(/=(.*)/s);
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
async function codexSession(title) {
  const name = (title ?? "").split(" | ")[0].trim();
  if (!name) return null;
  const text = (await readTextFile(`${home()}/.codex/session_index.jsonl`)) ?? "";
  const ids = new Set();
  for (const line of text.split("\n")) {
    const e = parse(line);
    if (e?.thread_name === name && ID.test(e.id ?? "")) ids.add(e.id);
  }
  return ids.size === 1 ? { session: [...ids][0] } : null;
}

function valid(rec) {
  return rec && (rec.agent === "claude" || rec.agent === "codex") && ID.test(rec.session ?? "")
    && typeof rec.cwd === "string" && rec.cwd.startsWith("/") && !/['\u0000-\u001f]/.test(rec.cwd);
}

function command(rec) {
  const flags = carry(rec.agent, rec.flags ?? []);
  const words = rec.agent === "claude"
    ? ["claude", ...flags, "--resume", rec.session]
    : ["codex", "resume", ...flags, rec.session];
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
      for (const t of terminals()) {
        if (!t.keep || t.state !== "live" || !t.foreground) continue;
        const saved = t.labels?.[LABEL];
        const prog = program(t);
        const agent = prog === "claude" ? "claude" : prog === "codex" ? "codex" : null;
        if (agent) {
          const found = agent === "claude" ? await claudeSession(t.foreground.pid) : await codexSession(t.title);
          if (!found) continue;
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
          // The same terminal process, back at a shell: the agent was quit on purpose.
          if (!valid(rec) || (idle(t) && t.pid === rec.shell)) await hc(["label", t.address, `${LABEL}=`]);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  async resume() {
    const done = [], skipped = [];
    for (const t of terminals()) {
      const rec = parse(t.labels?.[LABEL] ?? "");
      if (!valid(rec) || t.state !== "live") continue;
      if (t.pid === rec.shell || !idle(t)) continue; // nothing was lost, or something runs there
      const where = t.labels.where ?? t.address;
      if (rec.agent === "claude") {
        const dir = rec.cwd.replace(/[^A-Za-z0-9]/g, "-");
        const r = await exec("test", ["-f", `${home()}/.claude/projects/${dir}/${rec.session}.jsonl`]).catch(() => ({ code: 1 }));
        if (r.code !== 0) { skipped.push(`${where}: transcript gone`); continue; }
      }
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
