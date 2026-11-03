// Names each tab after what runs in it: an agent's conversation title, else
// the program's name, else the folder's. A tab the person named stays theirs;
// renaming it to an empty name hands it back. Draws nothing.

import { View, div } from "gpui-kit";
import { spaces, panes, run, home } from "herdr";

const STORE = "tab-titles.set";
const MAX = 40;

// Agents set their terminal title: Claude Code to the conversation's title
// ("Claude Code" before it has one), Codex to "<thread> | <folder>".
function agentTitle(p) {
  let t = (p.title ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  t = t.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (p.app === "codex" || p.program?.key === "codex") t = t.split(" | ")[0].trim();
  const names = [p.program?.name, p.program?.key, p.app, "claude code", "codex"].filter(Boolean).map((n) => n.toLowerCase());
  return t && !names.includes(t.toLowerCase()) ? t : null;
}

function folderName(cwd) {
  if (!cwd) return null;
  if (cwd === home()) return "~";
  return cwd.replace(/\/+$/, "").split("/").pop() || "/";
}

function nameFor(p) {
  const agent = p.program?.agent || p.app;
  if (agent) return agentTitle(p) ?? p.program?.name ?? null;
  if (p.program && !p.program.shell) return p.program.name;
  return folderName(p.cwd);
}

const clip = (s) => (s.length > MAX ? `${s.slice(0, MAX - 1).trimEnd()}…` : s);

export default class TabTitles extends View {
  init(_props, cx) {
    cx.timer.every(2000, () => this.sync());
    this.sync();
  }

  sync() {
    let ours;
    try { ours = JSON.parse(localStorage.getItem(STORE) ?? "{}"); } catch { ours = {}; }
    const next = {};
    const all = panes().filter((p) => p.terminal);
    for (const space of spaces()) {
      for (const tab of space.tabs) {
        // The person named it, not us: leave it alone.
        if (tab.named && tab.name !== ours[tab.id]) continue;
        const here = all.filter((p) => p.tab === tab.id);
        const pane = here.find((p) => p.program?.agent || p.app) ?? here.find((p) => p.focused) ?? here[0];
        const raw = pane && nameFor(pane);
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
