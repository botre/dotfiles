// Projects in the sidebar, in place of spaces. A project is a git remote; its
// tabs come from every space on every connected machine, joined by a
// `project=<id>` label on their terminals (membership.js). Tabs without one
// are in General. The store is synced between machines (store.js).
//
// One copy draws the sidebar list and does the work: it syncs the store, labels
// new tabs with the selected project, follows focus and keeps the last-active
// times. Copies opened with props { menu, project } or { dialog: "create" | "edit",
// project? } are the right-click menu and the create/edit dialog; they hand
// their result to the sidebar copy (shared PROJECT_ACTION + "projects.act"),
// since a popup's tasks end when it closes. The copy with props { picker: tab }
// is the Move to project popup, which hands over a "move" the same way.
// The copy with props { start: true }
// is the start page in the layout's main stack (start.js).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, terminals, agents, focused, machines, run, exec, hc, home, appHome, readTextFile, writeTextFile, theme, shared, setShared, openOverlay, closeOverlay, props, layout, notify, nextCommand, checking, pickFolder, window, knownAgents } from "herdr";
import { GENERAL, PROJECT_LABEL, STORE_PATH, DIRS_PATH, FAVICON_DIR, PROJECT_SELECTED, PROJECT_LIST, PROJECT_DIRS, PROJECT_ACTIVE, PROJECT_LAST_TAB, PROJECT_PENDING, PROJECT_ACTION, PROJECT_START_SHOWN, PROJECT_FAVICONS, GRID, MENU, projectIconView, statusGlyph, gridRow, gridTrail, generalProject, liveProjects, projectLabelOf, withProjectPending, tabProjects, projectTabs, projectStatus, projectAgents, projectIcon, moveCommands, pickerProjects, MAIN_STACK, MAIN_START, MAIN_TAB } from "./membership.js";
import { startPlace, startAgents, startActions, startCommand, worktreeOverlay } from "./start.js";
import { normalizeRemote, nameOf, parseStore, mergeProjects, planSync, upsert, remove, listedProjects, searchProjects, freshTerminals, autoLabels, touchActive, faviconSource, faviconBase, imageExt, iconCandidates } from "./store.js";

// Claude Code and Codex as clean one-colour marks: the shipped icons are a pixel
// sprite that blurs when scaled and a logo on a white square.
const BRAND = { claude: ["mods/agent-list/icons/claude.svg", "#D97757"], codex: ["mods/agent-list/icons/codex.svg", "#6F7DFF"] };

// Changes made on another machine show up within this long.
const POLL = 60000;
// The picture a project's icon comes from, when it has a favicon. An emoji draws as text.
const iconUrl = (p) => p.icon?.favicon ?? null;
// A favicon that failed to download is tried again after this long.
const FAVICON_RETRY = 600000;
const RAIL_CELL = 32;
const SELECT_RE = /^select-([1-9])$/;
// The agents each machine reported last, as the new-tab menu keeps them.
const KNOWN_AGENTS = "new-menu.agents";
// The timer looks at tabs only when no render has done so for this long.
const OBSERVE_EVERY = 2000;
// The element builders the shared grid helpers draw with (membership.js). Each is
// looked up when called, so a test can leave out the ones it never draws.
const UI = { div: (...a) => div(...a), h_flex: (...a) => h_flex(...a), svg: (...a) => svg(...a), image: (...a) => image(...a) };
// The project menu's rows, and the line before Delete.
const menuHeight = (n) => MENU.pad * 2 + n * MENU.row + (n - 1) * MENU.gap + 9;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// The project ctrl+N picks: the Nth in the sidebar's list.
export function projectFor(command, list) {
  const m = SELECT_RE.exec(command);
  return m ? list[Number(m[1]) - 1] ?? null : null;
}

// The tab to show when a project is picked: the one last shown there, else its first.
export function tabToShow(tabs, remembered) {
  return tabs.find((t) => t.id === remembered) ?? tabs[0] ?? null;
}

// The project focus moved into: only for a tab that changed, and not for a
// tab that just appeared (it is being labelled with the selected project).
export function followFocus(tab, before, tabProject, freshTabs, selected) {
  if (!tab || tab === before || freshTabs.has(tab)) return null;
  const project = tabProject.get(tab);
  return project && project !== selected ? project : null;
}

// What the create/edit dialog's icon field means: a URL is a favicon, anything else an emoji.
export function iconFrom(text) {
  const s = String(text ?? "").trim();
  if (!s) return {};
  return /^https?:\/\//i.test(s) ? { favicon: s } : { emoji: [...s].slice(0, 4).join("") };
}

// The folder to run New worktree in: on the machine in view, else here, else anywhere.
export function worktreeFolder(dirs, id, machine) {
  const order = [machine ?? "", "", ...Object.keys(dirs ?? {})];
  for (const m of order) if (dirs?.[m]?.[id]) return { folder: dirs[m][id], machine: m || null };
  return null;
}

// Files under each machine's home folder. Here through the app; elsewhere through sh.
async function readFile(on, rel) {
  if (!on) return readTextFile(`${home()}/${rel}`);
  const r = await exec("sh", ["-c", 'f="$HOME/$1"; [ -f "$f" ] || exit 3; cat "$f"', "_", rel], { on });
  if (r.code === 3) return null;
  if (r.code !== 0) throw new Error(r.stderr || `Couldn't read ${rel} on ${on}.`);
  return r.stdout;
}

async function writeFile(on, rel, text, expected) {
  if (!on) {
    const path = `${home()}/${rel}`;
    await exec("mkdir", ["-p", path.slice(0, path.lastIndexOf("/"))]);
    await writeTextFile(path, text, expected);
    return;
  }
  const r = await exec("sh", ["-c", 'f="$HOME/$2"; mkdir -p "$(dirname "$f")" && printf %s "$1" > "$f.tmp" && mv "$f.tmp" "$f"', "_", text, rel], { on });
  if (r.code !== 0) throw new Error(r.stderr || `Couldn't write ${rel} on ${on}.`);
}

function parseDirs(text) {
  try {
    const v = JSON.parse(text ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, d]) => typeof d === "string")) : {};
  } catch { return {}; }
}

const readyMachines = () => machines().filter((m) => m.name && m.layout === "ready").map((m) => m.name);

export default class Projects extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.menu) {
      this.handle = cx.focus_handle();
      this.handle.focus();
      this.at = 0;
      return;
    }
    if (p.picker) return this.initPicker(p, cx);
    if (p.dialog) return this.initDialog(p, cx);
    if (p.start) return this.initStart(cx);
    this.projects = mergeProjects(shared(PROJECT_LIST) ?? []);
    this.dirs = shared(PROJECT_DIRS) ?? {};
    this.favicons = {}; // url -> { path } once downloaded, { failed: ms } after a failure
    this.query = "";
    this.search = InputState.new({ placeholder: "Search projects" });
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); cx.notify(); });
    this.search.on("submit", (_e, cx) => {
      const first = searchProjects(this.projects, this.query)[0];
      if (first) this.select(first.id);
      this.search.set_value("");
      this.query = "";
      cx.notify();
    });
    this.seen = null; // terminal addresses at the last look
    this.readyBefore = new Set([null]);
    this.focusedTab = undefined;
    this.seq = new Map(); // agent address -> its seq at the last look
    if (checking()) return;
    cx.spawn(async (cx) => this.sync(cx));
    cx.timer.every(POLL, (cx) => cx.spawn(async (cx) => this.sync(cx)));
    // Renders follow live data; this catches what changes while the sidebar is hidden.
    cx.timer.every(OBSERVE_EVERY, (cx) => {
      if (Date.now() - (this.observedAt ?? 0) >= OBSERVE_EVERY - 100) this.observe(cx);
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        try { await this.command(command, cx); } catch (e) { notify({ title: "Projects", body: String(e), level: "error" }); }
        cx.notify();
      }
    });
  }

  selected() {
    const id = shared(PROJECT_SELECTED) ?? GENERAL;
    return id === GENERAL || liveProjects(this.projects).some((p) => p.id === id) ? id : GENERAL;
  }

  publish() {
    setShared(PROJECT_LIST, this.projects);
  }

  // --- Sync -------------------------------------------------------------

  // One sync at a time; a request meanwhile runs another right after.
  async sync(cx) {
    if (this.syncing) { this.again = true; return; }
    this.syncing = true;
    try {
      do {
        this.again = false;
        await this.syncOnce(cx);
        cx.notify();
      } while (this.again);
    } finally { this.syncing = false; }
  }

  async syncOnce(cx) {
    const reads = [];
    const dirs = {};
    for (const on of [null, ...readyMachines()]) {
      try {
        const text = await readFile(on, STORE_PATH);
        reads.push({ machine: on, text });
        dirs[on ?? ""] = parseDirs(await readFile(on, DIRS_PATH));
      } catch { /* unreachable now: next poll */ }
    }
    const plan = planSync(reads, this.projects);
    // Edits made while the files were read win over what they said.
    this.projects = mergeProjects(plan.projects, this.projects);
    this.publish();
    this.dirs = { ...this.dirs, ...dirs };
    setShared(PROJECT_DIRS, this.dirs);
    cx.notify();
    for (const on of plan.writes) {
      try { await writeFile(on, STORE_PATH, plan.text, reads.find((r) => r.machine === on)?.text ?? null); }
      catch { this.again = true; }
    }
    await this.fetchFavicons(cx);
  }

  // A favicon URL can name an image or a site. For a site, the page's own
  // <link rel="icon"> tags are tried first, then /favicon.ico.
  async fetchFavicons(cx) {
    // image() resolves against the app folder, so favicons live under it.
    const dir = `${appHome()}/${FAVICON_DIR}`;
    for (const p of liveProjects(this.projects)) {
      const url = iconUrl(p);
      const base = url && faviconBase(url);
      if (!base) continue;
      const have = this.favicons[url];
      if (have?.path || (have?.failed && Date.now() - have.failed < FAVICON_RETRY)) continue;
      try {
        const saved = (await exec("sh", ["-c", 'ls "$1"/"$2".* 2>/dev/null | head -n 1', "_", dir, base])).stdout?.trim();
        const file = saved ? saved.split("/").pop() : await this.downloadFavicon(url, dir, base);
        if (!file) throw new Error("no icon");
        this.favicons[url] = { path: `${FAVICON_DIR}/${file}` };
        // Dialogs are other copies of this mod; they read the paths from here.
        setShared(PROJECT_FAVICONS, Object.fromEntries(Object.entries(this.favicons).filter(([, v]) => v.path).map(([k, v]) => [k, v.path])));
      } catch { this.favicons[url] = { failed: Date.now() }; }
      cx.notify();
    }
  }

  // Downloads the first icon that works into dir/base.<ext>; returns its file name.
  async downloadFavicon(url, dir, base) {
    await exec("mkdir", ["-p", dir]);
    const curl = (src, out) => exec("curl", ["-fsSL", "--max-time", "15", "-A", "Mozilla/5.0", "-o", out, src], { timeout: 20000 });
    let candidates = [];
    if (imageExt(url)) candidates = [url];
    else {
      const page = `${dir}/${base}.html`;
      if ((await curl(url, page)).code === 0) candidates = iconCandidates(await readTextFile(page).catch(() => ""), url);
      await exec("rm", ["-f", page]);
      candidates.push(faviconSource(url));
    }
    for (const src of candidates) {
      const tmp = `${dir}/${base}.download`;
      if ((await curl(src, tmp)).code !== 0) continue;
      // Kept as downloaded: image() draws SVG, PNG, ICO and the other common formats.
      const ext = imageExt(src) ?? "ico";
      if ((await exec("mv", [tmp, `${dir}/${base}.${ext}`])).code === 0) return `${base}.${ext}`;
    }
    return null;
  }

  // --- Commands and actions -------------------------------------------

  async command(command, cx) {
    if (command === "act") return this.act(cx);
    const p = projectFor(command, listedProjects(this.projects, shared(PROJECT_ACTIVE) ?? {}));
    if (p) this.select(p.id);
  }

  async act(cx) {
    const a = shared(PROJECT_ACTION);
    if (!a || Date.now() - a.at > 10000) return;
    setShared(PROJECT_ACTION, null);
    if (a.kind === "select") return this.select(a.id);
    if (a.kind === "move") return this.moveTab(a.tab, a.id);
    if (a.kind === "show") this.projects = upsert(this.projects, a.id, { shown: a.shown });
    else if (a.kind === "delete") {
      this.projects = remove(this.projects, a.id);
      if (shared(PROJECT_SELECTED) === a.id) setShared(PROJECT_SELECTED, GENERAL);
    } else if (a.kind === "save") {
      this.projects = upsert(this.projects, a.id, { name: a.name, icon: a.icon });
      if (a.dir) await this.saveDir(a.machine ?? null, a.id, a.dir);
    } else return;
    this.publish();
    if (a.kind === "save" && a.create) this.select(a.id);
    cx.notify();
    await this.sync(cx);
  }

  async saveDir(on, id, dir) {
    try {
      const before = await readFile(on, DIRS_PATH);
      const dirs = { ...parseDirs(before), [id]: dir };
      await writeFile(on, DIRS_PATH, `${JSON.stringify(dirs, null, 2)}\n`, before);
      this.dirs = { ...this.dirs, [on ?? ""]: dirs };
      setShared(PROJECT_DIRS, this.dirs);
    } catch (e) { notify({ title: "Couldn't save the project's folder", body: String(e?.message ?? e), level: "warning" }); }
  }

  // Shows a project: its tabs fill the tab bar, and unless the tab in view is
  // one of them, the one last shown there (or its first) comes into view.
  select(id) {
    setShared(PROJECT_SELECTED, id);
    this.touch([id]);
    const sp = spaces(), ps = panes();
    const tabProject = tabProjects(sp, ps, new Map(terminals().map((k) => [k.address, k])), this.known(), shared(PROJECT_PENDING));
    const tabs = projectTabs(sp, id, tabProject, focused()?.tab);
    // The main area flips now, not when the tab bar next draws: the start page
    // for a project with no tab, its tabs otherwise.
    const stacked = JSON.stringify(layout() ?? {}).includes(`"${MAIN_STACK}"`);
    if (stacked) run("layout.select", { stack: MAIN_STACK, child: tabs.length ? MAIN_TAB : MAIN_START });
    if (!tabs.length) {
      if (stacked) setShared(PROJECT_START_SHOWN, Date.now());
      return;
    }
    if (tabs.some((t) => t.active)) return;
    const tab = tabToShow(tabs, (shared(PROJECT_LAST_TAB) ?? {})[id]);
    if (!tab) return;
    run("space.select", { id: tab.space });
    run("tab.select", { id: tab.id });
  }

  // Moves a tab to a project: every terminal in it gets the project's label
  // (General: none). The selection stays, so a tab moved elsewhere leaves the bar.
  async moveTab(tab, id) {
    const target = pickerProjects(this.projects).find((p) => p.id === id);
    const commands = target ? moveCommands(panes(), tab, id) : [];
    if (!commands.length) return;
    let pending = shared(PROJECT_PENDING);
    for (const [, address] of commands) pending = withProjectPending(pending, address, id === GENERAL ? "" : id);
    setShared(PROJECT_PENDING, pending);
    let failed = null;
    for (const args of commands) {
      const r = await hc(args).catch((e) => ({ code: 1, stderr: String(e) }));
      if (r.code !== 0) failed = r.stderr?.trim() || "hc label failed.";
    }
    if (failed) notify({ title: `Couldn't move it to ${target.name}`, body: failed, level: "error" });
    else notify({ title: `Moved to ${target.name}`, level: "success", timeout: 3000 });
  }

  known() {
    return new Set(liveProjects(this.projects).map((p) => p.id));
  }

  touch(ids) {
    const before = shared(PROJECT_ACTIVE) ?? {};
    const next = touchActive(before, ids);
    if (next !== before) setShared(PROJECT_ACTIVE, next);
  }

  // --- Watching tabs ----------------------------------------------------

  // Labels new tabs with the selected project, follows focus into another
  // project's tab, and records activity. Runs on every render and on a timer
  // (only while no render came). Returns what it read, for the render to reuse.
  observe(cx) {
    this.observedAt = Date.now();
    const sp = spaces(), ps = panes(), running = agents();
    const terms = new Map(terminals().map((k) => [k.address, k]));
    let pending = shared(PROJECT_PENDING);
    const fresh = freshTerminals(this.seen, this.readyBefore, ps);
    this.seen = new Set(ps.filter((p) => p.terminal).map((p) => p.terminal));
    this.readyBefore = new Set([null, ...readyMachines()]);
    const selected = this.selected();
    const labelFor = (address) => projectLabelOf(terms.get(address) ?? { address }, pending);
    const writes = autoLabels(fresh, ps, labelFor, selected);
    if (writes.length) {
      for (const w of writes) pending = withProjectPending(pending, w.address, w.project);
      setShared(PROJECT_PENDING, pending);
      cx.spawn(async () => {
        for (const w of writes) {
          const r = await hc(["label", w.address, `${PROJECT_LABEL}=${w.project}`]).catch((e) => ({ code: 1, stderr: String(e) }));
          if (r.code !== 0) notify({ title: "Couldn't add the tab to its project", body: r.stderr?.trim() || undefined, level: "warning" });
        }
      });
    }
    const tabProject = tabProjects(sp, ps, terms, this.known(), pending);
    const tab = focused()?.tab;
    const touched = [];
    if (tab && tab !== this.focusedTab) {
      const freshTabs = new Set(ps.filter((p) => fresh.has(p.terminal)).map((p) => p.tab));
      const next = followFocus(tab, this.focusedTab, tabProject, freshTabs, selected);
      this.focusedTab = tab;
      const project = tabProject.get(tab);
      if (project) {
        const last = shared(PROJECT_LAST_TAB) ?? {};
        if (last[project] !== tab) setShared(PROJECT_LAST_TAB, { ...last, [project]: tab });
        touched.push(project);
      }
      if (next) setShared(PROJECT_SELECTED, next);
    }
    for (const a of running) {
      const before = this.seq.get(a.address);
      this.seq.set(a.address, a.seq);
      if (before !== undefined && before !== a.seq) touched.push(tabProject.get(a.tab));
    }
    if (touched.length) this.touch(touched);
    return { tabProject, sp, running };
  }

  // --- Drawing ----------------------------------------------------------

  icon(p, t, size = GRID.icon) {
    if (p.id === GENERAL) return h_flex().w(size).h(size).flex_none().items_center().justify_center().text_color(t.muted)
      .child(svg("mods/workspace-chrome/layers.svg").size(size - 4));
    const src = iconUrl(p);
    const own = src && this.favicons?.[src]?.path;
    return projectIconView(UI, t, projectIcon(p, own ? { [src]: own } : shared(PROJECT_FAVICONS)), size);
  }

  // A row on the sidebar grid (membership.js), as the agents list draws its rows:
  // the agent count just left of the status slot. Idle shows its ring, like an agent row.
  row(p, t, on, status, count) {
    return gridRow(UI, {
      id: `project-${p.id}`,
      icon: this.icon(p, t),
      name: div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(p.name),
      details: [count > 0 && div().text_size(11).text_color(t.dim).child(String(count))],
      glyph: count > 0 && status ? statusGlyph(UI, t, status) : null,
    })
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .cursor_pointer()
      .on_click((_e, cx) => { this.select(p.id); cx.notify(); })
      .when(p.id !== GENERAL, (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(p); }));
  }

  compact(p, t, on, status) {
    return h_flex().justify_center().flex_none().child(h_flex().id(`project-${p.id}`).relative().w(RAIL_CELL).h(28).rounded(6)
      .items_center().justify_center().tooltip(p.name)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { this.select(p.id); cx.notify(); })
      .when(p.id !== GENERAL, (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(p); }))
      .child(this.icon(p, t))
      .when(status === "blocked" || status === "done", (el) => el.child(div().absolute().right(3).top(3).size(6).rounded(3).bg(t[status]))));
  }

  menu(p) {
    openOverlay({ mod: "projects", kind: "popup", width: 200, height: menuHeight(4), props: { menu: true, project: p.id } });
  }

  create() {
    openOverlay({ mod: "projects", kind: "dialog", width: 480, height: 400, props: { dialog: "create" } });
  }

  render(cx) {
    const p = props() ?? {};
    if (p.menu) return this.renderMenu(p);
    if (p.picker) return this.renderPicker(p);
    if (p.dialog) return this.renderDialog(p);
    if (p.start) return this.renderStart(cx);
    const t = theme();
    const collapsed = narrow();
    // One read of the host's lists per render: observe() hands back what it read.
    const { tabProject, sp, running } = this.observe(cx);
    const selected = this.selected();
    const searching = !collapsed && this.query.trim() !== "";
    const list = searching ? searchProjects(this.projects, this.query) : listedProjects(this.projects, shared(PROJECT_ACTIVE) ?? {});
    const rows = list.map((proj) => {
      const tabs = projectTabs(sp, proj.id, tabProject);
      const status = projectStatus(tabs);
      const on = proj.id === selected;
      return collapsed ? this.compact(proj, t, on, status) : this.row(proj, t, on, status, projectAgents(running, tabs));
    });
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      // The title starts where row content does; the + sits centred over the status column.
      .child(h_flex().h(GRID.sectionH).flex_none().pl(GRID.listPx + GRID.rowPx).pr(GRID.listPx + GRID.rowPx + GRID.status / 2 - 13)
        .items_center().justify_between().text_size(11.5).font_medium().text_color(t.dim)
        .when(collapsed, (el) => el.pl(0).pr(0).justify_center())
        .when(!collapsed, (el) => el.child("Projects"))
        .child(div().id("project-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .tooltip("New project").hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.create()).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      // On the grid too: the glyph over the icons, the text where names start.
      .when(!collapsed, (el) => el.child(h_flex().id("project-search").mx(GRID.listPx).mt(0).mb(GRID.listEnd).h(26).flex_none()
        .px(GRID.rowPx - 1).gap(GRID.iconGap).items_center().rounded(6)
        .border(1).border_color(t.border).text_color(t.dim)
        .on_key_down((e, cx) => {
          if (e.key !== "escape") return;
          this.search.set_value("");
          this.query = "";
          cx.stop_propagation();
          cx.notify();
        })
        .child(h_flex().w(GRID.icon).flex_none().justify_center().child(svg("mods/workspace-chrome/search.svg").size(12)))
        .child(Input.new(this.search).flex_1().min_w(0).h(24).items_center().text_size(12).text_color(t.foreground))))
      .child(v_flex().id("project-list").flex_1().min_h(0).px(collapsed ? 0 : GRID.listPx).pb(GRID.listEnd).gap(GRID.rowGap).overflow_y_scrollbar()
        .children(rows)
        .when(searching && rows.length === 0, (el) => el.child(div().px(GRID.rowPx).py(6).text_size(12).text_color(t.dim).child("No matching projects"))));
  }

  // --- Right-click menu ---------------------------------------------------

  menuItems(p) {
    const proj = (shared(PROJECT_LIST) ?? []).find((x) => x.id === p.project && !x.deleted);
    if (!proj) return [];
    const where = worktreeFolder(shared(PROJECT_DIRS), proj.id, spaces().find((s) => s.active)?.machine ?? null);
    return [
      { id: "worktree", label: "New worktree…", icon: "git-branch", enabled: Boolean(where), where },
      { id: "show", label: proj.shown ? "Hide from list" : "Show in list", icon: proj.shown ? "pin-off" : "pin", enabled: true, shown: !proj.shown },
      { id: "edit", label: "Edit…", icon: "square-pen", enabled: true },
      { id: "delete", label: "Delete", icon: "x", enabled: true },
    ];
  }

  chooseMenu(it, p) {
    if (!it?.enabled) return;
    closeOverlay(p.overlay);
    const act = (fields) => { setShared(PROJECT_ACTION, { ...fields, id: p.project, at: Date.now() }); run("projects.act"); };
    if (it.id === "worktree") {
      // New tabs join the selected project, so the worktree's tab joins this one.
      act({ kind: "select" });
      openOverlay({ mod: "worktree-org", kind: "dialog", width: 440, height: 260, props: { folder: it.where.folder, machine: it.where.machine, action: "new" } });
    } else if (it.id === "show") act({ kind: "show", shown: it.shown });
    else if (it.id === "edit") openOverlay({ mod: "projects", kind: "dialog", width: 480, height: 300, props: { dialog: "edit", project: p.project } });
    else if (it.id === "delete") act({ kind: "delete" });
  }

  renderMenu(p) {
    const t = theme();
    const items = this.menuItems(p);
    return v_flex().id("project-menu").track_focus(this.handle).w_full().min_h(0).p(MENU.pad).gap(MENU.gap).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (!items.length) return;
        if (e.key === "down") this.at = (this.at + 1) % items.length;
        else if (e.key === "up") this.at = (this.at + items.length - 1) % items.length;
        else if (e.key === "enter") this.chooseMenu(items[this.at], p);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.notify();
      })
      .children(items.map((it, i) => v_flex()
        .when(it.id === "delete", (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`pm-${it.id}`).h(MENU.row).px(8).gap(9).rounded(MENU.radius).items_center()
          .text_color(it.enabled ? t.foreground : t.dim)
          .when(i === this.at && it.enabled, (el) => el.bg(t.selected))
          .when(it.enabled, (el) => el.hover((s) => s.bg(t.hover)))
          .when(!it.enabled, (el) => el.tooltip("No folder for this project on a connected machine"))
          .on_click(() => this.chooseMenu(it, p))
          .child(svg(`mods/workspace-chrome/${it.icon}.svg`).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(it.label)))));
  }

  // --- Move to project picker ---------------------------------------------

  // The picker's projects and the one the tab is in now.
  pickerModel(tab) {
    const list = shared(PROJECT_LIST) ?? [];
    const known = new Set(liveProjects(list).map((x) => x.id));
    const terms = new Map(terminals().map((k) => [k.address, k]));
    const current = tabProjects(spaces(), panes(), terms, known, shared(PROJECT_PENDING)).get(tab) ?? GENERAL;
    return { items: pickerProjects(list), current };
  }

  initPicker(p, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    const { items, current } = this.pickerModel(p.picker);
    this.at = Math.max(0, items.findIndex((x) => x.id === current));
  }

  // The sidebar copy relabels the tab, since this popup's tasks end when it closes.
  choosePicker(proj, current, p) {
    closeOverlay(p.overlay);
    if (!proj || proj.id === current) return;
    setShared(PROJECT_ACTION, { kind: "move", tab: p.picker, id: proj.id, at: Date.now() });
    run("projects.act");
  }

  renderPicker(p) {
    const t = theme();
    const { items, current } = this.pickerModel(p.picker);
    this.at = Math.min(this.at, Math.max(0, items.length - 1));
    const shown = Math.min(Math.max(items.length, 1), 10);
    return v_flex().id("project-picker").track_focus(this.handle).size_full().min_h(0).p(MENU.pad).gap(MENU.gap).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % items.length;
        else if (e.key === "up") this.at = (this.at + items.length - 1) % items.length;
        else if (e.key === "enter") this.choosePicker(items[this.at], current, p);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(div().px(8).pt(8).h(MENU.heading).flex_none().text_size(11).text_color(t.dim).child("Move to project"))
      // A popup sizes to its content, so the list takes the height of its rows (ten at most, then it scrolls).
      .child(v_flex().id("picker-list").flex_none().h(shown * MENU.row + (shown - 1) * MENU.gap).gap(MENU.gap).overflow_y_scrollbar()
        .children(items.map((proj, i) => h_flex().id(`pk-${proj.id}`).h(MENU.row).px(8).gap(9).flex_none().rounded(MENU.radius).items_center()
          .cursor_pointer()
          .text_color(t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choosePicker(proj, current, p))
          .child(this.icon(proj, t, 16))
          .child(div().flex_1().min_w(0).truncate().child(proj.name))
          .when(proj.id === current, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(13).flex_none().text_color(t.accent))))));
  }

  // --- Start page ---------------------------------------------------------

  initStart(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
    this.shownAt = shared(PROJECT_START_SHOWN);
    this.agentLists = { ...(shared(KNOWN_AGENTS) ?? {}) };
    this.asked = new Set();
  }

  // Asks a machine once which agents it has; the cached list shows meanwhile.
  loadAgents(machine, cx) {
    const where = machine ?? "";
    if (this.asked.has(where) || checking()) return;
    this.asked.add(where);
    cx.spawn(async (cx) => {
      try {
        this.agentLists[where] = await knownAgents({ on: machine });
        setShared(KNOWN_AGENTS, { ...(shared(KNOWN_AGENTS) ?? {}), [where]: this.agentLists[where] });
      } catch { /* the cached list stays */ }
      cx.notify();
    });
  }

  startModel() {
    const selected = shared(PROJECT_SELECTED) ?? GENERAL;
    const proj = liveProjects(shared(PROJECT_LIST) ?? []).find((x) => x.id === selected) ?? generalProject();
    const inView = spaces().find((s) => s.active)?.machine ?? null;
    const place = startPlace(shared(PROJECT_DIRS) ?? {}, proj.id, inView, readyMachines(), home());
    const items = startActions(proj.id, place, startAgents(this.agentLists?.[place.machine ?? ""]));
    return { proj, place, items };
  }

  chooseStart(it, place) {
    if (!it) return;
    if (it.kind === "worktree") openOverlay(worktreeOverlay(it, place));
    else run(...startCommand(it, place, spaces()));
  }

  renderStart(cx) {
    const t = theme();
    const { proj, place, items } = this.startModel();
    this.loadAgents(place.machine, cx);
    // The tab bar marks each turn to the page; the page then takes the keyboard
    // from the tab hidden behind it.
    const shownAt = shared(PROJECT_START_SHOWN);
    if (shownAt !== this.shownAt) {
      this.shownAt = shownAt;
      this.at = 0;
      // Focus can't move during a draw, so it moves right after it.
      cx.spawn(async () => this.handle.focus());
    }
    this.at = Math.min(this.at, Math.max(0, items.length - 1));
    const general = proj.id === GENERAL;
    const tilde = (path) => (path === home() ? "~" : path.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);
    const [host, ...repo] = proj.id.split("/");
    const line = (icon, text, extra) => h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(12).flex_none())
      .child(div().truncate().child(text))
      .when(Boolean(extra), (el) => el.child(div().flex_none().text_color(t.dim).child(extra)));
    // Each action's icon sits right before its label, as in the menus.
    const icon = (it) => {
      const inner = it.kind !== "agent"
        ? svg(`mods/workspace-chrome/${it.icon}.svg`).size(16).text_color(t.muted)
        : !it.agent.icon ? div()
        : BRAND[it.agent.key] ? svg(BRAND[it.agent.key][0]).size(16).text_color(BRAND[it.agent.key][1])
        : it.agent.tint ? svg(it.agent.icon).size(16).text_color(t.foreground) : image(it.agent.icon).size(16);
      return h_flex().size(18).flex_none().items_center().justify_center().child(inner);
    };
    return v_flex().id("project-start").track_focus(this.handle).size_full().items_center().px(16)
      .bg(t.background).text_size(13)
      .on_mouse_down("left", () => this.handle.focus())
      .on_key_down((e, cx) => {
        if (!items.length || e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        if (e.key === "down") this.at = (this.at + 1) % items.length;
        else if (e.key === "up") this.at = (this.at + items.length - 1) % items.length;
        else if (e.key === "enter") this.chooseStart(items[this.at], place);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      // A quiet launcher, no card: the project's name, then one pill per action.
      .child(div().flex_1())
      .child(v_flex().items_center().gap(6).flex_none()
        .child(h_flex().gap(8).items_center()
          .child(this.icon(proj, t, 20))
          .child(div().text_size(16).font_semibold().text_color(t.foreground).child(proj.name)))
        .when(!general, (el) => el.child(div().text_size(12).text_color(t.dim).child(repo.join("/") || proj.id)))
        .when(!place.known, (el) => el.child(div().max_w(320).text_center().text_size(12).text_color(t.dim)
          .child("No folder for this project on a connected machine, so these start in your home folder."))))
      .child(v_flex().items_center().gap(8).pt(20).flex_none()
        .children(items.map((it, i) => h_flex().id(`ps-${it.id}`).w(240).h(38).px(16).gap(10).flex_none().items_center()
          .rounded(19).border(1).border_color(t.border).cursor_pointer().text_color(t.muted)
          .when(i === this.at, (el) => el.bg(t.hover).text_color(t.foreground))
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_mouse_move(() => { this.at = i; })
          .on_click((_e, cx) => { this.at = i; this.chooseStart(it, place); cx.notify(); })
          .child(icon(it))
          .child(div().flex_1().min_w(0).truncate().child(it.label)))))
      .child(div().flex_1())
      .child(div().flex_1());
  }

  // --- Create and edit dialog --------------------------------------------

  initDialog(p, cx) {
    const editing = p.dialog === "edit";
    const proj = editing ? (shared(PROJECT_LIST) ?? []).find((x) => x.id === p.project) : null;
    const space = spaces().find((s) => s.active);
    this.machine = editing ? null : space?.machine ?? null;
    const cwd = panes().find((x) => x.focused)?.cwd ?? "";
    const field = (placeholder, value) => {
      const state = InputState.new({ placeholder, value });
      state.on("change", (_e, cx) => { this.error = ""; cx.notify(); });
      state.on("submit", (_e, cx) => this.save(cx));
      state.on("focus", () => { this.focusedField = state; });
      return state;
    };
    this.fields = editing
      ? [field("Name", proj?.name ?? ""), field("Emoji or favicon URL", proj?.icon?.favicon ?? proj?.icon?.emoji ?? "")]
      : [field("Name (default: the repository's name)", ""), field("Folder in a git repository", cwd), field("Emoji or favicon URL", "")];
    // A prefilled field starts with the cursor after its text, not with the text selected.
    for (const f of this.fields) { const n = f.value().length; f.set_selected_range({ start: n, end: n }); }
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.busy = false;
    this.error = "";
    cx.timer.after(50, () => this.fields[editing ? 0 : 1].focus());
  }

  save(cx) {
    const p = props() ?? {};
    if (this.busy) return;
    const editing = p.dialog === "edit";
    const [nameField, dirField, iconField] = editing ? [this.fields[0], null, this.fields[1]] : this.fields;
    const name = nameField.value().trim();
    const icon = iconFrom(iconField.value());
    const post = (fields) => {
      setShared(PROJECT_ACTION, { kind: "save", ...fields, name, icon, at: Date.now() });
      run("projects.act");
      closeOverlay(p.overlay);
    };
    if (icon.favicon && !faviconSource(icon.favicon)) { this.error = "That favicon URL can't be read."; cx.notify(); return; }
    if (editing) {
      if (!name) { this.error = "Type a name."; cx.notify(); return; }
      return post({ id: p.project });
    }
    const dir = dirField.value().trim();
    if (!dir) { this.error = "Choose a folder in a git repository with a remote."; cx.notify(); return; }
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        // ~ means the home folder on the machine the folder is on.
        const r = await exec("sh", ["-c", 'd="$1"; case "$d" in "~") d="$HOME";; "~/"*) d="$HOME/${d#"~/"}";; esac; cd "$d" && git rev-parse --show-toplevel && git remote get-url origin', "_", dir], { on: this.machine });
        const [top, url] = r.stdout.trim().split("\n");
        const id = r.code === 0 ? normalizeRemote(url) : null;
        if (r.code !== 0) this.error = /not a git repository/i.test(r.stderr) ? "That folder isn't in a git repository."
          : /No such remote/i.test(r.stderr) ? "That repository has no remote named origin." : (r.stderr.trim() || "Couldn't read that folder.");
        else if (!id) this.error = "Its origin isn't a remote URL, so it can't be a project.";
        else if (liveProjects(shared(PROJECT_LIST) ?? []).some((x) => x.id === id)) this.error = `${id} is a project already.`;
        else return post({ id, name: name || nameOf(id), dir: top, machine: this.machine, create: true });
      } catch (e) { this.error = String(e?.message ?? e); }
      this.busy = false;
      cx.notify();
    });
  }

  renderDialog(p) {
    const t = theme();
    const editing = p.dialog === "edit";
    const proj = editing ? liveProjects(shared(PROJECT_LIST) ?? []).find((x) => x.id === p.project) : null;
    const machineNames = editing ? [] : [null, ...readyMachines()];
    const input = (state) => Input.new(state).h(32).px(10).items_center().rounded(6).border(1)
      .border_color(this.focusedField === state ? t.accent : t.border).bg(t.background).text_color(t.foreground);
    const label = (text) => div().w(56).flex_none().text_size(12).text_color(t.muted).child(text);
    const row = (name, field) => h_flex().gap(10).items_center().child(label(name)).child(div().flex_1().min_w(0).child(field));
    const hint = (text) => h_flex().gap(10).child(div().w(56).flex_none()).child(div().flex_1().text_size(11.5).text_color(t.dim).child(text));
    const button = (id, text, primary, onClick) => div().id(id).px(12).h(30).flex().items_center().rounded(6).cursor_pointer()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground))
      .when(!primary, (el) => el.bg(t.raised).text_color(t.foreground).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => onClick(cx)).child(text);
    const iconField = this.fields[editing ? 1 : 2];
    const tilde = (path) => (path.startsWith(home()) ? `~${path.slice(home().length)}` : path);
    // Where the project's checkouts are known: one line per machine.
    const folders = editing ? Object.entries(shared(PROJECT_DIRS) ?? {}).filter(([, d]) => d?.[p.project]).map(([m, d]) => [m || "This computer", tilde(d[p.project])]) : [];
    const [host, ...repo] = (p.project ?? "").split("/");
    const header = editing
      // The icon sits on the title's line; the details line up under the title.
      ? v_flex().gap(5)
        .child(h_flex().gap(8).items_center()
          .child(proj ? this.icon(proj, t, 20) : div().size(20))
          .child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().text_color(t.foreground).child(proj?.name ?? p.project)))
        .child(v_flex().pl(28).gap(3)
          .child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
            .child(svg("mods/workspace-chrome/git-branch.svg").size(12).flex_none())
            .child(div().truncate().child(repo.join("/") || p.project))
            .when(repo.length > 0, (el) => el.child(div().flex_none().text_color(t.dim).child(host))))
          .children(folders.map(([m, f]) => h_flex().gap(6).items_center().text_size(12).text_color(t.dim)
            .child(svg("mods/workspace-chrome/folder.svg").size(12).flex_none())
            .child(div().truncate().child(f))
            .when(folders.length > 1 || m !== "This computer", (el) => el.child(div().flex_none().child(`on ${m}`))))))
      : v_flex().gap(4)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child("New project"))
        .child(div().text_color(t.muted).text_size(12)
          .child("A project is a git remote. The folder only tells which one; the same remote on any machine is the same project."));
    return v_flex().id("project-dialog").track_focus(this.handle).size_full().p(16).gap(12).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(p.overlay); return; }
        if (e.key !== "tab") return;
        // Tab and Shift+Tab move between the fields.
        const at = Math.max(0, this.fields.findIndex((f) => f === this.focusedField));
        const next = (at + (e.modifiers.shift ? this.fields.length - 1 : 1)) % this.fields.length;
        this.focusedField = this.fields[next];
        this.fields[next].focus();
        cx.stop_propagation();
        cx.notify();
      })
      .child(header)
      .child(div().h(1).flex_none().bg(t.border))
      .child(row("Name", input(this.fields[0])))
      .when(!editing, (el) => el
        .child(row("Folder", h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).child(input(this.fields[1])))
          .when(!this.machine, (el) => el.child(button("pd-browse", "Browse…", false, (cx) => cx.spawn(async (cx) => {
            const folder = await pickFolder({ prompt: "Choose" });
            if (folder) this.fields[1].set_value(folder);
            cx.notify();
          }))))))
        .when(machineNames.length > 1, (el) => el.child(hint("").child(h_flex().gap(4)
          .children(machineNames.map((m) => div().id(`pd-machine-${m ?? "local"}`).px(6).rounded(4).text_size(11)
            .text_color(this.machine === m ? t.foreground : t.dim).when(this.machine === m, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.machine = m; this.error = ""; cx.notify(); })
            .child(m ?? "This computer")))))))
      .child(row("Icon", input(iconField)))
      .child(hint("An emoji, or a website address to use its favicon."))
      .when(Boolean(this.error), (el) => el.child(hint(this.error).text_color(t.blocked)))
      .child(div().flex_1())
      .child(h_flex().gap(8).items_center()
        .when(this.busy, (el) => el.child(div().text_color(t.dim).frames(["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"], 90))
          .child(div().text_size(12).text_color(t.dim).child("Reading the folder\u2026")))
        .child(div().flex_1())
        .child(button("pd-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("pd-save", editing ? "Save" : "Create", true, (cx) => this.save(cx))));
  }
}
