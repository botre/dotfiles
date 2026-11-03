// Names each tab after what runs in it: an agent's conversation title, else
// the program's name, else the folder's. A tab the person named stays theirs;
// renaming it to an empty name hands it back. Draws nothing.

import { View, div } from "gpui-kit";
import { spaces, panes, terminals, run, home, shared } from "herdr";

const NAME = "tab-titles";
const STORE = "tab-titles.set";
const MAX = 40;
const AGENTS = { claude: "Claude Code", codex: "Codex" };
const SHELLS = new Set(["zsh", "bash", "fish", "sh", "dash", "nu"]);

const base = (path) => (path ?? "").split("/").pop().replace(/^-/, "");

// Agents set their terminal title: Claude Code to the conversation's title
// ("Claude Code" before it has one), Codex to "<thread> | <folder>".
function agentTitle(p, prog) {
  let t = (p.title ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  t = t.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (prog === "codex") t = t.split(" | ")[0].trim();
  const names = [prog, "claude code", "codex"];
  return t && !names.includes(t.toLowerCase()) ? t : null;
}

function folderName(cwd) {
  if (!cwd) return null;
  if (cwd === home()) return "~";
  return cwd.replace(/\/+$/, "").split("/").pop() || "/";
}

// Decided by the terminal's foreground process: Herdr keeps reporting an
// agent for a while after it quits, with the shell's title already back.
function nameFor(p, fg) {
  const prog = base(fg?.argv?.[0]) || fg?.name;
  if (!prog || SHELLS.has(prog)) return folderName(fg?.cwd ?? p.cwd);
  if (prog in AGENTS) return agentTitle(p, prog) ?? AGENTS[prog];
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
    const next = {};
    const all = panes().filter((p) => p.terminal);
    const fg = new Map(terminals().map((t) => [t.address, t.foreground]));
    const isAgent = (p) => base(fg.get(p.terminal)?.argv?.[0]) in AGENTS;
    for (const space of spaces()) {
      for (const tab of space.tabs) {
        // The person named it, not us: leave it alone.
        if (tab.named && tab.name !== ours[tab.id]) continue;
        const here = all.filter((p) => p.tab === tab.id);
        const pane = here.find(isAgent) ?? here.find((p) => p.focused) ?? here[0];
        const raw = pane && nameFor(pane, fg.get(pane.terminal));
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
  }

  render() {
    return div();
  }
}
