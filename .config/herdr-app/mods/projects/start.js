// The start page: what the main area shows while the selected project has no
// tab. The tab bar switches the layout's main stack to it (mainChild in
// membership.js). These decide where its actions start and which it offers.

import { GENERAL, ALL } from "./membership.js";

// The agents the page starts, in this order, when installed.
export const START_AGENTS = ["claude", "codex"];

// Where the page's actions start. Scratch and All: this computer's home. A project: its
// folder on the machine in view, else here, else another connected machine;
// without one, this computer's home with `known: false`.
// dirs: { [machine or ""]: { [id]: folder } }; ready: connected machine names.
export function startPlace(dirs, id, inView, ready, homeDir) {
  if (id === ALL) id = GENERAL;
  if (id !== GENERAL) {
    const up = new Set(["", ...(ready ?? [])]);
    for (const m of [inView ?? "", "", ...Object.keys(dirs ?? {})]) {
      if (up.has(m) && dirs?.[m]?.[id]) return { folder: dirs[m][id], machine: m || null, known: true };
    }
  }
  return { folder: homeDir, machine: null, known: id === GENERAL };
}

// The installed agents the page offers, from knownAgents().
export function startAgents(known) {
  return START_AGENTS.map((key) => (known ?? []).find((a) => a.key === key && a.installed)).filter(Boolean);
}

// The page's rows. Worktrees need the project's repository, so General and a
// project without a folder go without them.
export function startActions(id, place, agents) {
  const repo = id !== GENERAL && place.known;
  return [
    ...agents.map((a) => ({ id: `agent-${a.key}`, kind: "agent", label: `Start ${a.name}`, hint: "A new agent in this folder", agent: a })),
    { id: "terminal", kind: "terminal", label: "New terminal", hint: "A shell in this folder", icon: "terminal" },
    ...(repo ? [
      { id: "worktree-new", kind: "worktree", action: "new", label: "New worktree…", hint: "Branch off for a new task", icon: "git-branch" },
      { id: "worktree-open", kind: "worktree", action: "open", label: "Open worktree…", hint: "Pick up an existing checkout", icon: "folder" },
    ] : []),
  ];
}

// The command that opens an agent's or a terminal's tab in the place: a tab in
// a space on its machine (the shown space first), or a new space there. The
// projects sidebar labels the new tab with the selected project.
export function startCommand(item, place, allSpaces) {
  const agent = item.kind === "agent" ? item.agent : null;
  const machine = place.machine ?? null;
  const there = (allSpaces ?? []).filter((s) => (s.machine ?? null) === machine);
  const space = there.find((s) => s.active) ?? there[0];
  const args = { folder: place.folder, ...(agent ? { argv: agent.run } : {}) };
  if (space) return ["tab.new", { ...args, space: space.id, ...(agent ? { name: agent.name } : {}) }];
  return ["space.new", { ...args, machine: machine ?? "", ...(agent ? { tab: agent.name } : {}) }];
}

// The worktree dialog for the project's folder.
export function worktreeOverlay(item, place) {
  const open = item.action === "open";
  return { mod: "worktree-org", kind: "dialog", width: open ? 560 : 440, height: open ? 480 : 260, props: { folder: place.folder, machine: place.machine, action: item.action } };
}
