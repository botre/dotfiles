// Projects: which tab belongs to which project. Copied verbatim into
// agent-tabs/, agent-list/ and project-suggest/ as projects.js (mods can't
// import from another mod's folder);
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
// Set when the main area turns to the start page, so the page takes the keyboard.
export const PROJECT_START_SHOWN = "projects.start-shown";
// Favicon URL -> downloaded file (under the app folder), as the sidebar copy has them.
export const PROJECT_FAVICONS = "projects.favicons";
// Agent address -> the project its suggestion strip was dismissed for.
export const PROJECT_DISMISSED = "projects.move-dismissed";
export const PROJECT_PENDING_MS = 5000;
export const PROJECT_RECENT = 5;

// The bjorn layout's main area: a stack of the shown tab and the start page.
export const MAIN_STACK = "main-stack";
export const MAIN_TAB = "main";
export const MAIN_START = "project-start";

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


// What the main area shows for the selected project's tabs: the start page
// while it has none, since the tab in view then belongs to another project.
export function mainChild(tabs) {
  return (tabs ?? []).length ? MAIN_TAB : MAIN_START;
}

// Letter tiles: one strong color per hue, light and dark alike (as spaces-plain).
const TILES = ["#22a99a", "#e3814f", "#5b8def", "#8b7cf6", "#3fae6a", "#d9649a"];

// A letter tile's color: the same for a project on every machine.
export function tileColor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return TILES[hash % TILES.length];
}

// How a project's icon draws: { favicon: path } once its picture is downloaded,
// { emoji } (drawn as text), else { letter, color } for a tile. Null for General,
// which has no icon of its own. favicons: url -> path (PROJECT_FAVICONS).
export function projectIcon(p, favicons) {
  if (!p || p.id === GENERAL) return null;
  const path = p.icon?.favicon && favicons?.[p.icon.favicon];
  if (path) return { favicon: path };
  if (p.icon?.emoji) return { emoji: p.icon.emoji };
  return { letter: ([...String(p.name ?? "").trim()][0] ?? "?").toUpperCase(), color: tileColor(p.id) };
}

// --- Sidebar grid ---------------------------------------------------------
// The projects list and the agents list draw their rows on one grid, so icons,
// names, counts and status glyphs line up down the whole sidebar. The drawing
// helpers take the element builders as `ui` ({ div, h_flex, svg, image }),
// since this file also loads without gpui-kit (in tests).
export const GRID = Object.freeze({
  // The list's side padding, then the row's: row content starts 16 from the edge,
  // where section labels and group headers start too.
  listPx: 8,
  rowPx: 8,
  rowH: 30,
  radius: 8,
  // Between rows, as between menu rows.
  rowGap: 2,
  // The icon slot, and the space from it to the name.
  icon: 18,
  iconGap: 9,
  // The status slot, always last, with the count (or other detail) just before it.
  status: 18,
  trailGap: 4,
  spinner: 12,
  dot: 7,
  // A section's title row ("Projects", "Agents").
  sectionH: 31,
  // Below the search box and at the end of a list.
  listEnd: 12,
});

// A project's picture (projectIcon) at `size`, centred in its box. An emoji is
// text with a pixel line height (a bare number would mean rem).
export function projectIconView(ui, t, pic, size = GRID.icon) {
  if (!pic) return ui.div().w(size).h(size).flex_none();
  if (pic.favicon) return ui.image(pic.favicon).w(size).h(size).flex_none().rounded(Math.round(size * 0.2));
  // An emoji glyph draws wider and lower than its font size, so it gets a
  // smaller size and a line box a little shorter than the slot to sit centred.
  if (pic.emoji) return ui.h_flex().w(size).h(size).flex_none().items_center().justify_center()
    .child(ui.div().text_size(Math.round(size * 0.68)).line_height(`${Math.round(size * 0.8)}px`).pb(Math.max(2, Math.round(size / 7))).text_color(t.foreground).child(pic.emoji));
  return ui.h_flex().w(size).h(size).flex_none().rounded(Math.round(size * 0.25)).bg(pic.color).items_center().justify_center()
    .text_size(Math.round(size * 0.6)).line_height(`${size}px`).font_bold().text_color("#ffffff").child(pic.letter);
}

// The glyph for a status: a spinner while working (slow and dim while it only
// waits on helpers), a badge when blocked, a dot when done, a ring when idle.
export function statusGlyph(ui, t, status, waiting = false) {
  if (waiting) return ui.svg("mods/workspace-chrome/spinner.svg").size(GRID.spinner).text_color(t.dim).spin(1800);
  if (status === "working") return ui.svg("mods/workspace-chrome/spinner.svg").size(GRID.spinner).text_color(t.working).spin(900);
  if (status === "blocked") return ui.div().size(14).rounded(4).bg(`${t.blocked}26`).text_size(10.5).font_bold().text_color(t.blocked)
    .flex().items_center().justify_center().child("!");
  if (status === "idle") return ui.div().size(GRID.dot).rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  if (status === "done") return ui.div().size(GRID.dot).rounded(4).bg(t.done ?? t.dim);
  return null;
}

// The status slot: the same box whatever it shows (or empty), so a change never
// moves the name and glyphs line up across rows.
export const statusSlot = (ui, glyph) => ui.h_flex().w(GRID.status).h(GRID.status).flex_none().items_center().justify_center()
  .when(Boolean(glyph), (el) => el.child(glyph));

// The right end of a row or group header: its details (a count, a time), then
// the status slot (`slot`, when the caller built its own from statusSlot).
export const gridTrail = (ui, details, glyph, slot = null) => ui.h_flex().flex_none().gap(GRID.trailGap).items_center()
  .children((details ?? []).filter(Boolean)).child(slot ?? statusSlot(ui, glyph));

// A list row on the grid: [icon slot] [name] [details] [status slot]. Callers
// add selection, hover and clicks.
export const gridRow = (ui, { id, icon, name, details, glyph, slot }) => ui.h_flex().id(id).h(GRID.rowH).px(GRID.rowPx).gap(GRID.iconGap)
  .flex_none().items_center().rounded(GRID.radius)
  .child(ui.h_flex().w(GRID.icon).h(GRID.icon).flex_none().items_center().justify_center().when(Boolean(icon), (el) => el.child(icon)))
  .child(ui.h_flex().flex_1().min_w(0).items_center().child(name))
  .child(gridTrail(ui, details, glyph, slot));

// The hc commands that move a tab to a project: a label on each of its
// terminals, removed for General.
export function moveCommands(allPanes, tab, project) {
  const value = project && project !== GENERAL ? project : "";
  const addresses = [...new Set((allPanes ?? []).filter((p) => p.tab === tab && p.terminal).map((p) => p.terminal))];
  return addresses.map((address) => ["label", address, `${PROJECT_LABEL}=${value}`]);
}

// The "Move to project" picker: General, then every project by name.
export const pickerProjects = (list) => [generalProject(), ...[...liveProjects(list)].sort(byProjectName)];

// Menus and pickers: popup padding, row height, the gap between rows, a heading's height.
export const MENU = Object.freeze({ pad: 5, row: 31, gap: 2, heading: 26, radius: 7 });

const PICKER_ROWS = 10;
// The picker popup for a tab, sized to its list (it scrolls past ten projects).
export function pickerOverlay(tab, list) {
  const rows = Math.min(pickerProjects(list).length, PICKER_ROWS);
  return { mod: "projects", kind: "popup", width: 260, height: MENU.pad * 2 + MENU.heading + rows * MENU.row + (rows - 1) * MENU.gap, props: { picker: tab } };
}
