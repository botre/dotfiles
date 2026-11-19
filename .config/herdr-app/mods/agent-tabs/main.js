import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, terminals, focused, run, openOverlay, theme, window, shared, setShared, layout, settings, nextCommand } from "herdr";
import { GENERAL, PROJECT_SELECTED, PROJECT_LIST, PROJECT_PENDING, PROJECT_START_SHOWN, MAIN_STACK, MAIN_START, GRID, liveProjects, tabProjects, projectTabs, mainChild } from "./projects.js";

// The agents list snoozes or parks an agent with a label on its terminal,
// and shares what it just wrote until hc has it (agent-list/inbox.js).
const SNOOZED = "inbox.snoozed";
const SETTLED = "inbox.settled";
const SETTLED_RE = /^(\d+):(\d+)$/;
const PENDING = "agent-list.pending";
const PENDING_MS = 5000;
const NUMBER_RE = /^\d+$/;
const SELECT_RE = /^select-([1-9])$/;

function labelNow(key, address, terms, pending, now) {
  const p = pending?.[address];
  return p && Object.prototype.hasOwnProperty.call(p, key) && now - p.at < PENDING_MS ? p[key] : terms.get(address)?.labels?.[key];
}

function snoozedNow(address, terms, pending, now) {
  const value = labelNow(SNOOZED, address, terms, pending, now);
  return NUMBER_RE.test(value ?? "") && Number(value) > now;
}

// Parked until it works, needs you or starts a new turn, as the agents list
// has it, so the tab comes back before that list clears the label.
function settledNow(pane, terms, pending, now) {
  const m = SETTLED_RE.exec(labelNow(SETTLED, pane.terminal, terms, pending, now) ?? "");
  if (!m || pane.status === "working" || pane.status === "blocked") return false;
  return (terms.get(pane.terminal)?.turn ?? 0) <= Number(m[2]);
}

// The selected project's tabs, from every space on every machine, each with
// its space; `active` marks the tab in focus (each space has its own active tab).
// A label naming a project that is gone counts as General.
export function projectBarTabs(allSpaces, allPanes, terms, projects, selected, focusedTab, pending = null, now = Date.now()) {
  const known = new Set(liveProjects(projects).map((p) => p.id));
  const project = selected === GENERAL || known.has(selected) ? selected : GENERAL;
  return projectTabs(allSpaces, project, tabProjects(allSpaces, allPanes, terms, known, pending, now), focusedTab);
}

// The tab in focus: focused().tab, else the shown space's active tab.
function focusedTab(allSpaces) {
  return focused()?.tab ?? allSpaces.find((s) => s.active)?.tabs.find((t) => t.active)?.id ?? null;
}

// One read of the host's lists: every call copies the whole list.
function snapshot() {
  return { allSpaces: spaces(), allPanes: panes(), terms: new Map(terminals().map((k) => [k.address, k])) };
}

// The selected project's tabs now, hidden ones included.
function selectedTabs({ allSpaces, allPanes, terms } = snapshot()) {
  return projectBarTabs(allSpaces, allPanes, terms, shared(PROJECT_LIST) ?? [], shared(PROJECT_SELECTED) ?? GENERAL, focusedTab(allSpaces), shared(PROJECT_PENDING));
}

// What the bar shows now: the selected project's visible tabs.
function barTabs(snap = snapshot(), tabs = selectedTabs(snap)) {
  return visibleTabs(tabs, snap.allPanes, snap.terms);
}

// Shows a tab from any space: its space first, then the tab.
function selectTab(tab) {
  if (!spaces().find((s) => s.id === tab.space)?.active) run("space.select", { id: tab.space });
  run("tab.select", { id: tab.id });
}

// The tabs the bar shows: all but those whose every agent is snoozed or
// parked. The tab in view always shows, and a tab without an agent never
// hides. A put-away terminal counts as an agent even while it reports no
// status (Herdr marks a program as an agent only once it does).
export function visibleTabs(tabs, all = panes(), terms = new Map(terminals().map((k) => [k.address, k])), pending = shared(PENDING), now = Date.now()) {
  return (tabs ?? []).filter((tab) => {
    if (tab.active) return true;
    const mine = all.filter((p) => p.tab === tab.id && p.terminal);
    const away = new Set(mine.filter((p) => snoozedNow(p.terminal, terms, pending, now) || settledNow(p, terms, pending, now)).map((p) => p.terminal));
    const agents = mine.filter((p) => p.program?.agent || p.status || away.has(p.terminal));
    return !(agents.length && agents.every((p) => away.has(p.terminal)));
  });
}

// alt-1..9 and the next/prev keys go by the tabs the bar shows, not by every tab.
export function tabFor(command, tabs) {
  const n = SELECT_RE.exec(command);
  if (n) return tabs[Number(n[1]) - 1] ?? null;
  const step = command === "next" ? 1 : command === "prev" ? -1 : 0;
  if (!step || !tabs.length) return null;
  const at = tabs.findIndex((t) => t.active);
  return tabs[((at < 0 ? 0 : at + step) + tabs.length) % tabs.length];
}

// One tab per wheel notch. A touchpad or smooth-scrolling mouse sends many
// small events per gesture: a short swipe or one smoothed notch (about 25 px)
// moves one tab, a longer swipe keeps going a tab per 60 px, at most one every
// 100 ms so each shows. Returns "prev", "next" or null.
export function wheelStep(swipe, e, now = Date.now()) {
  if (e.delta_lines) return e.delta_lines.y ? (e.delta_lines.y > 0 ? "prev" : "next") : null;
  const dy = e.delta?.y ?? 0;
  // Phases often arrive only as moves (a macOS touchpad included): a pause or
  // a turn starts a new gesture.
  if (e.touch_phase === "started" || now - swipe.at > 250 || dy * swipe.acc < 0) Object.assign(swipe, { acc: 0, steps: 0 });
  swipe.at = now;
  swipe.acc += dy;
  const need = swipe.steps ? 60 : 20;
  if (Math.abs(swipe.acc) < need || now - swipe.last < 100) return null;
  swipe.acc -= Math.sign(swipe.acc) * need;
  swipe.steps++;
  swipe.last = now;
  return dy > 0 ? "prev" : "next";
}

// A saved object, or {} when the value is missing or corrupt.
export function savedObject(raw) {
  let value;
  try { value = JSON.parse(raw ?? "{}"); } catch { return {}; }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.panels = savedObject(localStorage.getItem("panels"));
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
    // A snooze that runs out changes nothing the bar watches, so it looks again now and then.
    cx.timer.every(15000, (cx) => cx.notify());
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        const tab = tabFor(command, barTabs());
        if (tab) selectTab(tab);
        cx.notify();
      }
    });
  }

  // The side panel is remembered per project: switching shows that project's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(key, panel, body, enabled) {
    if (!key || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (key !== this.panelKey) {
      const first = this.panelKey === undefined;
      this.panelKey = key; this.pending = null;
      if (!(first && !(key in this.panels))) {
        const stored = this.panels[key] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[key] === now) return;
    this.panels[key] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // The main area shows the start page while the selected project has no tab.
  // Layouts without the main stack keep showing the tab.
  syncMain(stack, want, now = Date.now()) {
    if (!stack?.children?.some((c) => c.id === want)) return;
    if ((stack.active ?? stack.children[0]?.id) === want) { this.mainWant = null; return; }
    // The layout follows a moment later; until then, renders don't ask again.
    if (this.mainWant?.want === want && now < this.mainWant.until) return;
    this.mainWant = { want, until: now + 1000 };
    run("layout.select", { stack: MAIN_STACK, child: want });
    if (want === MAIN_START) setShared(PROJECT_START_SHOWN, now);
  }

  render() {
    const t = theme();
    const snap = snapshot();
    const tabs = selectedTabs(snap);
    const shown = barTabs(snap, tabs);
    // Each tab's program and whether it is the Agents overview, from the one pane read.
    const programs = new Map(), overviews = new Set();
    for (const p of snap.allPanes) {
      if (p.mod === "agent-list") overviews.add(p.tab);
      const have = programs.get(p.tab);
      if (!have || (!have.agent && p.program?.agent)) programs.set(p.tab, { program: p.program, agent: Boolean(p.program?.agent) });
    }
    // Keep the active tab in view: index into the tabs the bar shows.
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const overview = overviews.has(c.id);
      const program = programs.get(c.id)?.program;
      const name = c.named ? c.name : program?.name ?? "Terminal";
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          // Tabs only move within their own space.
          const space = spaces().find((s) => s.id === c.space);
          if (from !== null && from !== i && shown[from]?.space === c.space && space) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else selectTab(c);
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu-org", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: c.space } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .when(overview, el => el.child(svg("mods/agent-list/agents.svg").size(14).text_color(t.muted)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(GRID.spinner).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(GRID.dot).flex_none().rounded(4).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(shared(PROJECT_SELECTED) ?? GENERAL, panel, body, enabled);
    this.syncMain(find(root, MAIN_STACK), mainChild(tabs));
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => {
        const step = wheelStep(this.swipe, e);
        const tab = step && tabFor(step, shown);
        if (tab) selectTab(tab);
      })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu-org", kind: "popup", width: 250, height: 512 })))
      // The tab-actions menu; off in the Mods panel hides the button. Height: 31 per action, plus 10.
      .when(!(shared("mods.off") ?? []).includes("tab-actions"), el => el.child(button("tab-actions", svg("mods/tab-actions/more.svg").size(16),
        () => openOverlay({ mod: "tab-actions", kind: "popup", width: 250, height: 41 }))))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
