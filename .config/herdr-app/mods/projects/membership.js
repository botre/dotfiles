// Projects: which tab belongs to which project. Copied verbatim into
// agent-tabs/ and agent-list/ (mods can't import from another mod's folder);
// tests/herdr-projects.test.mjs fails when the copies drift.
//
// Tabs join a project through a `project=<id>` label on their terminals; a
// tab without one is in General.

export const GENERAL = "general";
export const PROJECT_LABEL = "project";
// Under each machine's home folder.
export const STORE_PATH = ".local/state/herdr/projects.json";
export const DIRS_PATH = ".local/state/herdr/project-dirs.json";
// Relative to the app folder, since image() resolves paths against it.
export const FAVICON_DIR = "data/projects/favicons";
// Shared keys (window state and what the projects mod publishes).
export const PROJECT_SELECTED = "projects.selected";
export const PROJECT_LIST = "projects.list";
export const PROJECT_DIRS = "projects.dirs";
export const PROJECT_ACTIVE = "projects.active";
export const PROJECT_LAST_TAB = "projects.last-tab";
export const PROJECT_PENDING = "projects.pending";
export const PROJECT_ACTION = "projects.action";
export const PROJECT_PENDING_MS = 5000;
export const PROJECT_RECENT = 5;

export const generalProject = () => ({ id: GENERAL, name: "General", icon: {}, shown: true, updated_at: 0 });

export const liveProjects = (list) => (list ?? []).filter((p) => !p.deleted && p.id !== GENERAL);
export const byProjectName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || (a.id < b.id ? -1 : 1);

// General first, then by name: the agents list's group order.
export function projectRank(list) {
  return new Map([GENERAL, ...[...liveProjects(list)].sort(byProjectName).map((p) => p.id)].map((id, i) => [id, i]));
}

// A terminal's project label as shown now: what was just written, else what the core has.
export function projectLabelOf(terminal, pending, now = Date.now()) {
  const p = pending?.[terminal?.address];
  if (p && now - p.at < PROJECT_PENDING_MS) return p.project ?? "";
  return terminal?.labels?.[PROJECT_LABEL] ?? "";
}

// The pending map with `project` for `address`, stale entries dropped.
export function withProjectPending(pending, address, project, now = Date.now()) {
  const kept = Object.fromEntries(Object.entries(pending ?? {}).filter(([, p]) => now - p.at < PROJECT_PENDING_MS));
  kept[address] = { project, at: now };
  return kept;
}

// Each tab's project: the first label on its terminals, General without one,
// or when the label names a project that no longer exists (`known`, if given).
// terms: Map address -> terminal (terminals()).
export function tabProjects(spaces, panes, terms, known = null, pending = null, now = Date.now()) {
  const out = new Map();
  for (const s of spaces ?? []) for (const tab of s.tabs ?? []) out.set(tab.id, GENERAL);
  for (const p of panes ?? []) {
    if (!p.terminal || !out.has(p.tab) || out.get(p.tab) !== GENERAL) continue;
    const id = projectLabelOf(terms?.get(p.terminal) ?? { address: p.terminal }, pending, now);
    if (id && id !== GENERAL && (!known || known.has(id))) out.set(p.tab, id);
  }
  return out;
}

// A project's tabs from every space, in space order, each with its space and
// machine, and `active` set for the tab in focus (each space has its own).
export function projectTabs(spaces, project, tabProject, focusedTab = null) {
  return (spaces ?? []).flatMap((s) => (s.tabs ?? [])
    .filter((tab) => (tabProject.get(tab.id) ?? GENERAL) === project)
    .map((tab) => ({ ...tab, active: tab.id === focusedTab, space: s.id, machine: s.machine ?? null })));
}

// How many agents run in a project's tabs. Plain shells don't count, and
// sub-agents without a tab of their own fold under their parent.
export function projectAgents(agents, tabs) {
  const ids = new Set((tabs ?? []).map((t) => t.id));
  return (agents ?? []).filter((a) => ids.has(a.tab)).length;
}

// The most urgent status among a project's tabs.
const STATUS_RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
export function projectStatus(tabs) {
  return (tabs ?? []).reduce((top, t) => ((STATUS_RANK[t.status] ?? 0) > (STATUS_RANK[top] ?? 0) ? t.status : top), null);
}

