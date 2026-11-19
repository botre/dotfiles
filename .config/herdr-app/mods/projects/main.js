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
// since a popup's tasks end when it closes.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, terminals, agents, focused, machines, run, exec, hc, home, appHome, readTextFile, writeTextFile, theme, shared, setShared, openOverlay, closeOverlay, props, layout, notify, nextCommand, checking, pickFolder } from "herdr";
import { GENERAL, PROJECT_LABEL, STORE_PATH, DIRS_PATH, FAVICON_DIR, PROJECT_SELECTED, PROJECT_LIST, PROJECT_DIRS, PROJECT_ACTIVE, PROJECT_LAST_TAB, PROJECT_PENDING, PROJECT_ACTION, liveProjects, projectLabelOf, withProjectPending, tabProjects, projectTabs, projectStatus, projectAgents } from "./membership.js";
import { normalizeRemote, nameOf, parseStore, mergeProjects, planSync, upsert, remove, listedProjects, searchProjects, freshTerminals, autoLabels, touchActive, faviconSource, faviconBase, imageExt, iconCandidates, initial } from "./store.js";

// Changes made on another machine show up within this long.
const POLL = 60000;
// A favicon that failed to download is tried again after this long.
const FAVICON_RETRY = 600000;
const RAIL_CELL = 32;
// Letter tiles: one strong color per hue, light and dark alike (as spaces-plain).
const TILES = ["#22a99a", "#e3814f", "#5b8def", "#8b7cf6", "#3fae6a", "#d9649a"];
const SELECT_RE = /^select-([1-9])$/;

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

// A letter tile's color: the same for a project on every machine.
export function tileColor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return TILES[hash % TILES.length];
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
    if (p.dialog) return this.initDialog(p, cx);
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
    cx.timer.every(2000, (cx) => this.observe(cx));
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
  // <link rel="icon"> tags are tried first, then /favicon.ico. Anything but a
  // PNG is turned into one when ImageMagick is there, since .ico may not draw.
  async fetchFavicons(cx) {
    // image() resolves against the app folder, so favicons live under it.
    const dir = `${appHome()}/${FAVICON_DIR}`;
    for (const p of liveProjects(this.projects)) {
      const url = p.icon?.favicon;
      const base = url && faviconBase(url);
      if (!base) continue;
      const have = this.favicons[url];
      if (have?.path || (have?.failed && Date.now() - have.failed < FAVICON_RETRY)) continue;
      try {
        const saved = (await exec("sh", ["-c", 'ls "$1"/"$2".* 2>/dev/null | head -n 1', "_", dir, base])).stdout?.trim();
        const file = saved ? saved.split("/").pop() : await this.downloadFavicon(url, dir, base);
        if (!file) throw new Error("no icon");
        this.favicons[url] = { path: `${FAVICON_DIR}/${file}` };
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
    const magick = (await exec("sh", ["-c", "command -v magick || command -v convert"])).stdout?.trim();
    for (const src of candidates) {
      const tmp = `${dir}/${base}.download`;
      if ((await curl(src, tmp)).code !== 0) continue;
      const ext = imageExt(src) ?? "ico";
      if (ext !== "png" && magick) {
        // [0]: an .ico holds several sizes; the first is enough at sidebar size.
        const r = await exec(magick, [`${tmp}[0]`, "-background", "none", "-resize", "64x64", `${dir}/${base}.png`]);
        await exec("rm", ["-f", tmp]);
        if (r.code === 0) return `${base}.png`;
        continue;
      }
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
    if (tabs.some((t) => t.active)) return;
    const tab = tabToShow(tabs, (shared(PROJECT_LAST_TAB) ?? {})[id]);
    if (!tab) return;
    run("space.select", { id: tab.space });
    run("tab.select", { id: tab.id });
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
  // project's tab, and records activity. Runs on every render and on a timer.
  observe(cx) {
    const sp = spaces(), ps = panes();
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
    for (const a of agents()) {
      const before = this.seq.get(a.address);
      this.seq.set(a.address, a.seq);
      if (before !== undefined && before !== a.seq) touched.push(tabProject.get(a.tab));
    }
    if (touched.length) this.touch(touched);
    return tabProject;
  }

  // --- Drawing ----------------------------------------------------------

  icon(p, t, size = 18) {
    if (p.id === GENERAL) return h_flex().size(size).flex_none().items_center().justify_center().text_color(t.muted)
      .child(svg("mods/workspace-chrome/layers.svg").size(size - 4));
    const fav = p.icon?.favicon && this.favicons?.[p.icon.favicon]?.path;
    if (fav) return image(fav).size(size).flex_none().rounded(4);
    if (p.icon?.emoji) return h_flex().size(size).flex_none().items_center().justify_center().text_size(size - 4).child(p.icon.emoji);
    return h_flex().size(size).flex_none().rounded(5).bg(tileColor(p.id)).items_center().justify_center()
      .text_size(size * 0.58).font_bold().text_color("#ffffff").child(initial(p.name));
  }

  row(p, t, on, status, count) {
    return h_flex().id(`project-${p.id}`).h(30).px(8).gap(9).flex_none().items_center().rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .cursor_pointer()
      .on_click((_e, cx) => { this.select(p.id); cx.notify(); })
      .when(p.id !== GENERAL, (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(p); }))
      .child(this.icon(p, t))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(p.name))
      .when(status === "blocked" || status === "done", (el) => el.child(div().size(6).flex_none().rounded(3).bg(t[status])))
      .when(status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(count > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(String(count))));
  }

  compact(p, t, on, status) {
    return h_flex().justify_center().flex_none().child(h_flex().id(`project-${p.id}`).relative().w(RAIL_CELL).h(28).rounded(6)
      .items_center().justify_center().tooltip(p.name)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { this.select(p.id); cx.notify(); })
      .when(p.id !== GENERAL, (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(p); }))
      .child(this.icon(p, t, 18))
      .when(status === "blocked" || status === "done", (el) => el.child(div().absolute().right(3).top(3).size(6).rounded(3).bg(t[status]))));
  }

  menu(p) {
    openOverlay({ mod: "projects", kind: "popup", width: 200, height: 160, props: { menu: true, project: p.id } });
  }

  create() {
    openOverlay({ mod: "projects", kind: "dialog", width: 460, height: 380, props: { dialog: "create" } });
  }

  render(cx) {
    const p = props() ?? {};
    if (p.menu) return this.renderMenu(p);
    if (p.dialog) return this.renderDialog(p);
    const t = theme();
    const collapsed = narrow();
    const tabProject = this.observe(cx);
    const selected = this.selected();
    const searching = !collapsed && this.query.trim() !== "";
    const list = searching ? searchProjects(this.projects, this.query) : listedProjects(this.projects, shared(PROJECT_ACTIVE) ?? {});
    const sp = spaces(), running = agents();
    const rows = list.map((proj) => {
      const tabs = projectTabs(sp, proj.id, tabProject);
      const status = projectStatus(tabs);
      const on = proj.id === selected;
      return collapsed ? this.compact(proj, t, on, status) : this.row(proj, t, on, status, projectAgents(running, tabs));
    });
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).flex_none().pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, (el) => el.pl(0).pr(0).justify_center())
        .when(!collapsed, (el) => el.child("Projects"))
        .child(div().id("project-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .tooltip("New project").hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.create()).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .when(!collapsed, (el) => el.child(h_flex().id("project-search").mx(8).mt(6).mb(8).h(26).flex_none().px(8).gap(6).items_center().rounded(6)
        .border(1).border_color(t.border).text_color(t.dim)
        .on_key_down((e, cx) => {
          if (e.key !== "escape") return;
          this.search.set_value("");
          this.query = "";
          cx.stop_propagation();
          cx.notify();
        })
        .child(svg("mods/workspace-chrome/search.svg").size(12).flex_none())
        .child(Input.new(this.search).flex_1().min_w(0).h(24).items_center().text_size(12).text_color(t.foreground))))
      .child(v_flex().id("project-list").flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).gap(1).overflow_y_scrollbar()
        .children(rows)
        .when(searching && rows.length === 0, (el) => el.child(div().px(8).py(6).text_size(12).text_color(t.dim).child("No matching projects"))));
  }

  // --- Right-click menu ---------------------------------------------------

  menuItems(p) {
    const proj = (shared(PROJECT_LIST) ?? []).find((x) => x.id === p.project && !x.deleted);
    if (!proj) return [];
    const where = worktreeFolder(shared(PROJECT_DIRS), proj.id, spaces().find((s) => s.active)?.machine ?? null);
    return [
      { id: "worktree", label: "New worktree", icon: "git-branch", enabled: Boolean(where), where },
      { id: "show", label: proj.shown ? "Hide from list" : "Show in list", icon: proj.shown ? "pin-off" : "pin", enabled: true, shown: !proj.shown },
      { id: "edit", label: "Edit", icon: "square-pen", enabled: true },
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
    else if (it.id === "edit") openOverlay({ mod: "projects", kind: "dialog", width: 460, height: 260, props: { dialog: "edit", project: p.project } });
    else if (it.id === "delete") act({ kind: "delete" });
  }

  renderMenu(p) {
    const t = theme();
    const items = this.menuItems(p);
    return v_flex().id("project-menu").track_focus(this.handle).w_full().min_h(0).p(5).gap(2).bg(t.popover).text_size(12.8)
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
        .child(h_flex().id(`pm-${it.id}`).h(31).px(8).gap(9).rounded(7).items_center()
          .text_color(it.enabled ? t.foreground : t.dim)
          .when(i === this.at && it.enabled, (el) => el.bg(t.selected))
          .when(it.enabled, (el) => el.hover((s) => s.bg(t.hover)))
          .when(!it.enabled, (el) => el.tooltip("No folder for this project on a connected machine"))
          .on_click(() => this.chooseMenu(it, p))
          .child(svg(`mods/workspace-chrome/${it.icon}.svg`).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(it.label)))));
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
    const machineNames = editing ? [] : [null, ...readyMachines()];
    const input = (state) => Input.new(state).h(32).px(10).items_center().rounded(6).border(1).border_color(t.input).bg(t.background).text_color(t.foreground);
    const label = (text) => div().text_size(11.5).text_color(t.dim).child(text);
    return v_flex().id("project-dialog").track_focus(this.handle).size_full().p(16).gap(8).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(p.overlay); return; }
        if (e.key !== "tab") return;
        // Tab and Shift+Tab move between the fields.
        const at = Math.max(0, this.fields.findIndex((f) => f === this.focusedField));
        const next = (at + (e.modifiers.shift ? this.fields.length - 1 : 1)) % this.fields.length;
        this.focusedField = this.fields[next];
        this.fields[next].focus();
        cx.stop_propagation();
      })
      .child(div().font_semibold().text_color(t.foreground).child(editing ? `Edit ${p.project}` : "New project"))
      .when(!editing, (el) => el.child(div().text_color(t.muted).text_size(12)
        .child("A project is a git remote. Its folder only tells which remote; the same remote on any machine is the same project.")))
      .child(label("Name"))
      .child(input(this.fields[0]))
      .when(!editing, (el) => el
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().child(label("Folder")))
          .children(machineNames.length > 1 ? machineNames.map((m) => div().id(`pd-machine-${m ?? "local"}`).px(6).rounded(4).text_size(11)
            .text_color(this.machine === m ? t.foreground : t.dim).when(this.machine === m, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.machine = m; this.error = ""; cx.notify(); })
            .child(m ?? "This computer")) : []))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).child(input(this.fields[1])))
          .when(!this.machine, (el) => el.child(div().id("pd-browse").px(8).h(32).flex().items_center().rounded(6).border(1).border_color(t.input)
            .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => cx.spawn(async (cx) => {
              const folder = await pickFolder({ prompt: "Choose" });
              if (folder) this.fields[1].set_value(folder);
              cx.notify();
            }))
            .child("Browse")))))
      .child(label("Icon"))
      .child(input(this.fields[editing ? 1 : 2]))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().justify_end().gap(6).text_size(11).text_color(t.dim)
        .when(this.busy, (el) => el.child(div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)))
        .child(this.busy ? "reading the folder…" : editing ? "↵ save · esc cancel" : "↵ create · esc cancel"));
  }
}
