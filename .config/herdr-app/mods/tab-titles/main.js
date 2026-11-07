// Uses the name given with Claude Code's /rename, then an agent's published
// session title, then its goal or conversation title.
// Preserve manual tab names. Clearing a name enables automatic titles again.

import { View, div } from "gpui-kit";
import { spaces, panes, terminals, run, home, shared, readTextFile, exec } from "herdr";

const CONTROL_CHARACTERS_RE = /[\u0000-\u001f\u007f]/g;
const TITLE_PREFIX_RE = /^[^\p{L}\p{N}]+/u;
// Spinner frames, and a status word after a separator ("Fix tests \u00b7 Thinking"),
// that some agents append to their title.
const SPINNER_SUFFIX_RE = /[\s\u2800-\u28ff\u25d0-\u25d3\u2722-\u273d\u00b7\u2022*]+$/u;
const STATUS_SUFFIX_RE = /\s*(?:[\u00b7\u2022|:\u2013]|\s-)\s*(?:working|thinking|running|busy)[.!\u2026]*$/iu;

const LEADING_HYPHEN_RE = /^-/;
const TRAILING_SLASHES_RE = /\/+$/;
const TRANSIENT_TITLE_RE = /^(?:action required|attention required|needs (?:you|attention|approval|input)|approval required|waiting(?: for (?:input|approval|you))?|working|thinking|running|busy|idle|done|blocked|error|ready|codex|claude(?: code)?)[.!…\s]*$/i;

const NAME = "tab-titles";
const STORE = "tab-titles.set";
const MAX = 40;
const AGENTS = { claude: "Claude Code", codex: "Codex" };
const SHELLS = new Set(["zsh", "bash", "fish", "sh", "dash", "nu"]);

const base = (path) => (path ?? "").split("/").pop().replace(LEADING_HYPHEN_RE, "");

// Agents set their terminal title: Claude Code to the conversation's title
// ("Claude Code" before it has one), Codex to "<thread> | <folder>".
function cleanTitle(value) {
  if (typeof value !== "string") return null;
  let t = value.replace(CONTROL_CHARACTERS_RE, " ").trim();
  t = t.replace(TITLE_PREFIX_RE, "").replace(SPINNER_SUFFIX_RE, "").replace(STATUS_SUFFIX_RE, "").replace(SPINNER_SUFFIX_RE, "").trim();
  return t && !TRANSIENT_TITLE_RE.test(t) ? t : null;
}

function agentTitle(p, prog) {
  let t = cleanTitle(p.title);
  if (!t) return null;
  if (prog === "codex") t = t.split(" | ")[0].trim();
  const names = [prog, "claude code", "codex"];
  return cleanTitle(t) && !names.includes(t.toLowerCase()) ? t : null;
}

function publishedTitle(terminal, record = {}) {
  const updated = Number(terminal?.labels?.["session.title.updated"]) * 1000;
  const author = terminal?.labels?.["session.title.pid"];
  const current = (!author || author === String(terminal?.foreground?.pid)) && updated > 0
    && updated <= Date.now() + 5000 && (!record.startedAt || updated >= record.startedAt - 2000);
  return current ? cleanTitle(terminal.labels["session.title"]) : null;
}

function folderName(cwd) {
  if (!cwd) return null;
  if (cwd === home()) return "~";
  return cwd.replace(TRAILING_SLASHES_RE, "").split("/").pop() || "/";
}

// Claude Code keeps each session's name in ~/.claude/sessions/<pid>.json, and
// marks it "user" once the person names the session with /rename.
function renamedTitle(json) {
  try {
    const session = JSON.parse(json ?? "");
    return session?.nameSource === "user" ? cleanTitle(session.name) : null;
  } catch { return null; }
}

const RENAME_CHECK_MS = 10000;
const machineOf = (address) => (address?.includes("/") ? address.slice(0, address.lastIndexOf("/")) : "");

async function readSession(machine, pid) {
  if (!machine) return readTextFile(`${home()}/.claude/sessions/${pid}.json`);
  const r = await exec("sh", ["-c", 'cat "$HOME/.claude/sessions/$0.json"', String(pid)], { on: machine });
  return r?.code === 0 ? r.stdout : null;
}

function nameFor(p, fg, terminal, record, renamed) {
  const prog = base(fg?.argv?.[0]) || fg?.name;
  if (prog in AGENTS || p.program?.agent) {
    return renamed || publishedTitle(terminal, record) || cleanTitle(record?.goal) || agentTitle(p, p.program?.key ?? prog);
  }
  if (!prog || SHELLS.has(prog)) return folderName(fg?.cwd ?? p.cwd);
  return p.program && !p.program.shell && !p.program.agent ? p.program.name : prog;
}

// Turned off in the Mods popup (ctrl-shift-m).
const off = () => (shared("mods.off") ?? []).includes(NAME);

const clip = (s) => (s.length > MAX ? `${s.slice(0, MAX - 1).trimEnd()}…` : s);

export default class TabTitles extends View {
  init(_props, cx) {
    cx.timer.every(2000, () => this.sync());
    this.sync();
  }

  sync() {
    if (off()) return;
    let ours;
    try { ours = JSON.parse(localStorage.getItem(STORE) ?? "{}"); } catch { ours = {}; }
    const next = { ...ours };
    const knownSpaces = spaces();
    const seenTabs = new Set(knownSpaces.flatMap((space) => space.tabs.map((tab) => tab.id)));
    const heardMachines = new Set(knownSpaces.map((space) => space.machine ?? ""));
    for (const id of Object.keys(next)) {
      const machine = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
      if (!seenTabs.has(id) && heardMachines.has(machine)) delete next[id];
    }
    const all = panes().filter((p) => p.terminal);
    const terminalByAddress = new Map(terminals().map((t) => [t.address, t]));
    const records = shared("agents.sessions") ?? {};
    const isAgent = (p) => p.program?.agent || base(terminalByAddress.get(p.terminal)?.foreground?.argv?.[0]) in AGENTS;
    for (const space of knownSpaces) {
      for (const tab of space.tabs) {
        // The person named it, not us: leave it alone.
        if (tab.named && tab.name !== ours[tab.id]) { delete next[tab.id]; continue; }
        const here = all.filter((p) => p.tab === tab.id);
        const pane = here.find(isAgent) ?? here.find((p) => p.focused) ?? here[0];
        const terminal = terminalByAddress.get(pane?.terminal);
        const raw = pane && (nameFor(pane, terminal?.foreground, terminal, records[pane.terminal], this.renamed(terminal))
          || cleanTitle(ours[tab.id]) || (isAgent(pane) ? pane.program?.name : null));
        if (!raw) {
          if (tab.named) next[tab.id] = tab.name;
          continue;
        }
        const name = clip(raw);
        next[tab.id] = name;
        if (!tab.named || tab.name !== name) run("tab.rename", { id: tab.id, name });
      }
    }
    localStorage.setItem(STORE, JSON.stringify(next));
    for (const [key, entry] of this.renames ?? []) if (Date.now() - entry.at > 6 * RENAME_CHECK_MS) this.renames.delete(key);
  }

  // The /rename name of a Claude Code terminal, read in the background at most
  // every ten seconds; the next sync uses it.
  renamed(terminal) {
    const pid = terminal?.foreground?.pid;
    if (base(terminal?.foreground?.argv?.[0]) !== "claude" || !Number.isInteger(pid)) return null;
    // Herdr builds views without their constructor, so class fields stay unset.
    this.renames ??= new Map();
    const key = `${machineOf(terminal.address)}:${pid}`;
    const known = this.renames.get(key);
    const now = Date.now();
    if (!known || (!known.busy && now - known.at > RENAME_CHECK_MS)) {
      const entry = { name: known?.name ?? null, at: now, busy: true };
      this.renames.set(key, entry);
      readSession(machineOf(terminal.address), pid)
        .then((json) => { entry.name = renamedTitle(json); }, () => {})
        .finally(() => { entry.busy = false; });
    }
    return known?.name ?? null;
  }

  render() {
    return div();
  }
}
