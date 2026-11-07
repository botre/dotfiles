// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left. A finished agent can be settled
// or snoozed into folded shelves at the bottom (inbox.js); new work brings it back.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, hc, notify, nextCommand, home, keys } from "herdr";
import { SessionTracker } from "./sessions.js";
import { helperName } from "./model.js";
import { ICON } from "./ui.js";
import { overview } from "./overview.js";
import { SETTLED, SNOOZED, PENDING, ACTION, parseSettled, parseSnoozed, labelOf, withPending, presets, wakeLabel, reference } from "./inbox.js";

// A run that stops stays with Working this long, so a quick follow-up doesn't move it twice.
const GRACE = 2000;
const UNDO_MS = 5000;
const CLEAR_ASK_MS = 3000;
const UNDO_ICON = "mods/agent-list/undo.svg";
const PLAY_ICON = "mods/agent-list/play.svg";
const X_ICON = "mods/workspace-chrome/x.svg";
// Shared by the resume mod: sessions that a restart left waiting in their tab.
const RESUME_WAITING = "resume.waiting";
const RESUME_ACTION = "resume.action";
const MENU_ROW = 31;

const TITLE_PREFIX_RE = /^[^\p{L}\p{N}]+/u;
const PATH_TITLE_RE = /^[~/]|^[A-Za-z]:\\/;

const DIGITS_RE = /^\d+$/;

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

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

const clean = (s) => (s ?? "").replace(TITLE_PREFIX_RE, "").trim();

function lead(tab, all = panes()) {
  const mine = all.filter(p => p.tab === tab.id && p.terminal);
  return mine.find(p => p.program?.agent) ?? mine.find(p => p.focused) ?? mine[0];
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !PATH_TITLE_RE.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return tab.name === prog && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// Pane-less sub-agents are absent from agents(). Treat errors as blocked.
// Their parent reports completion, so display their done state as idle.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
// The statuses of an agent's live sub-agents, at any depth.
const kidStatuses = (all, addr, listed) => all
  .filter((k) => k.parent === addr && k.state === "live")
  .flatMap((k) => [kidStatus(k, listed), ...kidStatuses(all, k.address, listed)]);
// How many helpers an agent waits on: it has stopped while they still work.
const waitingOn = (a, all, listed) => (a.status === "working" || a.status === "blocked" ? 0
  : kidStatuses(all, a.address, listed).filter((s) => s === "working").length);
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function whereIs(address) {
  const pane = panes().find((p) => p.terminal === address);
  const space = pane && spaces().find((s) => s.tabs.some((tab) => tab.id === pane.tab));
  return { pane, space, tab: space?.tabs.find((tab) => tab.id === pane.tab) };
}

// The other spaces on the agent's machine, in sidebar order.
function moveTargets(address) {
  const { space } = whereIs(address);
  if (!space) return [];
  return spaces().filter((s) => s.id !== space.id && (s.machine ?? null) === (space.machine ?? null));
}

// The row menu's entries for an agent, as it stands now (labels as just written).
function menuItems(address, { snoozeOnly = false, finished = false, blocked = false, pinned = false } = {}) {
  const term = terminals().find((t) => t.address === address) ?? { address };
  const pending = shared(PENDING);
  const settled = parseSettled(labelOf(term, SETTLED, pending));
  const snoozed = parseSnoozed(labelOf(term, SNOOZED, pending));
  const chrome = (name) => `mods/workspace-chrome/${name}.svg`;
  const items = [];
  if (!snoozeOnly) {
    items.push({ kind: "rename", icon: chrome("square-pen"), label: "Rename", hint: keys().find((k) => k.action === "tab.rename")?.keys });
    items.push({ kind: "reference", icon: chrome("terminal"), label: "Reference in focused agent" });
    if (!settled && !snoozed) items.push(pinned ? { kind: "unpin", icon: chrome("pin-off"), label: "Unpin" } : { kind: "pin", icon: chrome("pin"), label: "Pin to the top" });
    if (settled) items.push({ kind: "unsettle", icon: UNDO_ICON, label: "Un-settle" });
    else if (finished) items.push({ kind: "settle", icon: chrome("check"), label: "Settle", hint: keys().find((k) => k.action === "agent-list.settle")?.keys });
    if (snoozed) items.push({ kind: "wake", icon: UNDO_ICON, label: "Wake now" });
  }
  if (!snoozeOnly) {
    const targets = moveTargets(address);
    if (targets.length) items.push({ heading: "Move to" });
    for (const s of targets) items.push({ kind: "move", preset: s.id, icon: chrome("layers"), label: s.name });
  }
  // A blocked agent needs you now, so it can't be snoozed.
  if (!blocked && !snoozed) {
    if (!snoozeOnly) items.push({ heading: "Snooze until" });
    for (const p of presets()) items.push({ kind: "snooze", preset: p.id, icon: chrome("clock"), label: p.label, hint: wakeLabel(p.wake) });
  }
  return items;
}

const menuHeight = (items) => 10 + items.reduce((h, it) => h + (it.heading ? 26 : MENU_ROW), 0);

// Agent programs a terminal can run while Herdr lists it only once it reports a status.
const AGENT_PROGRAMS = new Set(["claude", "codex"]);
// Claude Code and Codex spin a half circle or braille dots in the title while they work.
const WORKING_TITLE_RE = /^[\u25D0-\u25D3\u2800-\u28FF]/;

// Terminals in a pane that run Claude Code or Codex but report no status, as
// rows like agents()'s. Claude Code stops reporting once it moves a session into
// its background daemon; the title still spins, so it gives a rough status.
// terminals() drops the spinner from titles, so `titles` holds them as hc has them.
export function unreportedAgents(listed, all, allPanes, allSpaces, titles = new Map()) {
  const known = new Set(listed.map((a) => a.address));
  const byTerminal = new Map(allPanes.filter((p) => p.terminal).map((p) => [p.terminal, p]));
  const rows = [];
  for (const t of all) {
    if (t.state !== "live" || known.has(t.address)) continue;
    // By the process's name too: a wrapper (node …/codex) starts with its interpreter.
    const names = [t.foreground?.name, String(t.foreground?.argv?.[0] ?? "").split("/").pop()];
    if (!names.some((n) => AGENT_PROGRAMS.has(n))) continue;
    const pane = byTerminal.get(t.address);
    if (!pane) continue;
    const space = allSpaces.find((s) => s.tabs.some((tab) => tab.id === pane.tab));
    const tab = space?.tabs.find((x) => x.id === pane.tab);
    if (!space || !tab) continue;
    rows.push({
      address: t.address, pane: pane.pane, space: space.id, space_name: space.name,
      tab: tab.id, tab_index: tab.index, tab_name: tab.name,
      status: WORKING_TITLE_RE.test(titles.get(t.address) ?? "") ? "working" : "idle",
      app: null, program: pane.program, title: t.title ?? "", seq: 0, focused: pane.focused, unreported: true,
    });
  }
  return rows;
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu || props()?.rowMenu) return;
    if (props()?.overview) {
      this.expanded = new Set();
      cx.timer.every(10000, (cx) => cx.notify());
      return;
    }
    this.folded = new Set(["inbox-snoozed", "inbox-settled"]);
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    // Woken from a snooze and not looked at since.
    this.woke = new Set(JSON.parse(localStorage.getItem("woke") ?? "[]"));
    this.sessions = new SessionTracker();
    cx.spawn(async (cx) => this.sessions.sync(cx));
    cx.timer.every(5000, (cx) => cx.spawn(async (cx) => this.sessions.sync(cx)));
    this.rawTitles = new Map();
    cx.timer.every(3000, (cx) => cx.spawn(async (cx) => this.readTitles(cx)));
    // Snoozes are checked on every draw; this draws often enough to wake them on time.
    cx.timer.every(15000, (cx) => cx.notify());
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        try { await this.command(command, cx); } catch (e) { notify({ title: "Agents list", body: String(e), level: "error" }); }
        cx.notify();
      }
    });
  }

  // Reads the titles of agents that report no status as hc has them, spinner and all.
  async readTitles(cx) {
    if (this.readingTitles) return;
    this.readingTitles = true;
    try {
      const next = new Map();
      for (const address of this.unreported ?? []) {
        const r = await hc(["get", address, "--json"]).catch(() => null);
        try { if (r?.code === 0) next.set(address, JSON.parse(r.stdout).title ?? ""); } catch { /* not JSON: no title */ }
      }
      const changed = next.size !== this.rawTitles.size || [...next].some(([a, title]) => this.rawTitles.get(a) !== title);
      this.rawTitles = next;
      if (changed) cx.notify();
    } finally { this.readingTitles = false; }
  }

  // Asks the resume mod to resume or forget the sessions of these terminals,
  // and drops their rows now rather than at its next look.
  resumeAction(kind, addresses, cx) {
    setShared(RESUME_WAITING, (shared(RESUME_WAITING) ?? []).filter((w) => !addresses.includes(w.address)));
    setShared(RESUME_ACTION, { kind, addresses, at: Date.now() });
    run("resume.act");
    this.hovered = null;
    cx.notify();
  }

  // The "Can be resumed" section: tabs a restart turned back into shells
  // that still hold an agent's session. Empty when there are none.
  resumable(t, now) {
    const byTerminal = new Map(panes().filter((p) => p.terminal).map((p) => [p.terminal, p]));
    const waiting = (shared(RESUME_WAITING) ?? []).filter((w) => byTerminal.has(w.address));
    if (!waiting.length) return [];
    const all = waiting.map((w) => w.address);
    const link = (id, text, tip, onClick) => div()
      .id(id)
      .px(5)
      .rounded(4)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(text);
    const header = h_flex()
      .id("resume-header")
      .px(8)
      .pt(8)
      .h(30)
      .flex_none()
      .gap(2)
      .items_center()
      .text_size(11)
      .font_medium()
      .child(div().truncate().text_color(t.accent).child("Can be resumed"))
      .child(div().pl(4).text_color(t.dim).child(String(waiting.length)))
      .child(div().flex_1())
      .child(link("resume-all", "Resume all", "Resume every session (Ctrl+Shift+R)", (cx) => this.resumeAction("resume", all, cx)))
      .child(link("resume-dismiss-all", "Dismiss all", "Forget these sessions; the tabs stay shells", (cx) => this.resumeAction("forget", all, cx)));
    const button = (id, glyph, tip, onClick) => div()
      .id(id)
      .flex_none()
      .p(2)
      .rounded(4)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(svg(glyph).size(13));
    const row = (w) => {
      const pane = byTerminal.get(w.address);
      const key = `resume:${w.address}`;
      const hovered = this.hovered === key;
      // The tab names the work; an automatic tab number says nothing, so the space does.
      const named = Boolean(w.tab) && !DIGITS_RE.test(w.tab);
      const name = named ? w.tab : w.space ?? w.address;
      const more = named ? w.space : null;
      const agent = w.agent === "codex" ? "Codex" : "Claude";
      return h_flex()
        .id(`resume-${w.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(pane.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = key;
          else if (this.hovered === key) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: pane.pane }))
        .child(image(`icons/${w.agent}.svg`).w(16).h(16).flex_none().opacity(hovered || pane.focused ? 1 : 0.6))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(more ? 120 : 200).truncate().text_color(t.foreground).child(name))
          .when(Boolean(more), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(hovered, (el) => el.child(h_flex().flex_none().gap(1).items_center()
          .child(button(`resume-run-${w.address}`, PLAY_ICON, `Resume ${agent}`, (cx) => this.resumeAction("resume", [w.address], cx)))
          .child(button(`resume-dismiss-${w.address}`, X_ICON, "Dismiss: forget this session, keep the shell", (cx) => this.resumeAction("forget", [w.address], cx)))))
        .when(!hovered && Boolean(w.active), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - w.active))));
    };
    return [header, ...waiting.map(row)];
  }

  // Key commands, and what the row menu asks for (it closes before its tasks could finish).
  async command(command, cx) {
    if (command === "settle") return this.settleInView(cx);
    if (command !== "act") return;
    const act = shared(ACTION);
    if (!act || Date.now() - act.at > 10000) return;
    setShared(ACTION, null);
    const { kind, address } = act;
    if (kind === "settle") return this.putAway([address], "Settled", (a) => ({ [SETTLED]: `${Date.now()}:${this.terms?.get(a)?.turn ?? 0}`, [SNOOZED]: "" }), cx);
    if (kind === "snooze") {
      const wake = presets(Date.now()).find((p) => p.id === act.preset)?.wake;
      if (!wake) { notify({ title: "That time has passed", level: "warning", timeout: 3000 }); return; }
      return this.putAway([address], "Snoozed", () => ({ [SNOOZED]: String(wake), [SETTLED]: "" }), cx);
    }
    if (kind === "unsettle") return this.write(address, { [SETTLED]: "" });
    if (kind === "wake") return this.write(address, { [SNOOZED]: "" });
    if (kind === "pin") return this.setPins([...this.pins.filter((p) => p !== address), address]);
    if (kind === "unpin") return this.setPins(this.pins.filter((p) => p !== address));
    if (kind === "reference") return this.reference(address, cx);
    if (kind === "move") return this.move(address, act.preset, cx);
    // Without a name, Herdr asks for one, as the tab's own Rename does.
    if (kind === "rename") { const tab = whereIs(address).pane?.tab; if (tab) run("tab.rename", { id: tab }); }
  }

  // Moves an agent's pane to a new tab in another space; it keeps running.
  // Herdr has no move, so its pane goes (terminal.park, which also turns off
  // keep) and comes back as a tab of the selected space (terminal.keep, which
  // turns keep back on). The space in view stays the same.
  async move(address, spaceId, cx) {
    const from = whereIs(address);
    const to = spaces().find((s) => s.id === spaceId);
    if (!from.pane || !to) return;
    const back = spaces().find((s) => s.active)?.id;
    // A tab's name goes with it only when the agent was all of it; otherwise
    // "" gives the new tab Herdr's automatic name (keep names it by address).
    const name = from.tab?.named && from.tab.panes === 1 ? from.tab.name : "";
    const until = async (done) => {
      for (let i = 0; i < 40; i++) { if (done()) return true; await cx.sleep(75); }
      return false;
    };
    const fail = (why) => notify({ title: `Couldn't move it to ${to.name}`, body: why, level: "error" });
    run("terminal.park", { terminal: address });
    if (!(await until(() => !panes().some((p) => p.terminal === address)))) return fail("Its pane didn't go away.");
    run("space.select", { id: spaceId });
    run("terminal.keep", { terminal: address, place: "tab" });
    const landed = await until(() => whereIs(address).space?.id === spaceId);
    if (landed) run("tab.rename", { id: whereIs(address).pane.tab, name });
    if (back) run("space.select", { id: back });
    if (!landed) return fail(`It still runs, without a pane: hc attach ${address}`);
    notify({ title: `Moved to ${to.name}`, level: "success", timeout: 3000 });
  }

  // Writes labels on an agent's terminal, shown at once as pending.
  async write(address, fields) {
    setShared(PENDING, withPending(shared(PENDING), address, fields));
    const r = await hc(["label", address, ...Object.entries(fields).map(([k, v]) => `${k}=${v}`)]).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code === 0) return true;
    const pending = { ...(shared(PENDING) ?? {}) };
    delete pending[address];
    setShared(PENDING, pending);
    notify({ title: "Couldn't update the agent", body: r.stderr?.trim() || undefined, level: "error" });
    return false;
  }

  label(address, key) {
    return labelOf(this.terms?.get(address) ?? { address }, key, shared(PENDING));
  }

  // Settles or snoozes agents: they lose their pin, the one in view hands focus
  // to the next card, and an Undo notice offers them back.
  async putAway(addresses, verb, fields, cx) {
    const items = addresses.map((address) => ({
      address,
      [SETTLED]: this.label(address, SETTLED),
      [SNOOZED]: this.label(address, SNOOZED),
      pin: this.pins.indexOf(address),
    }));
    if (addresses.some((a) => this.pins.includes(a))) this.setPins(this.pins.filter((p) => !addresses.includes(p)));
    this.moveOn(addresses);
    const now = Date.now();
    const more = this.undo?.verb === verb && now < this.undo.until ? this.undo.items : [];
    this.undo = { verb, items: [...more, ...items], until: now + UNDO_MS };
    cx.timer.after(UNDO_MS + 50, (cx) => cx.notify());
    // The row moves away from under the pointer, and no hover-out comes.
    this.hovered = null;
    cx.notify();
    for (const address of addresses) await this.write(address, fields(address));
  }

  async undoLast(cx) {
    const undo = this.undo;
    if (!undo) return;
    this.undo = null;
    const pins = [...this.pins];
    for (const it of [...undo.items].sort((x, y) => x.pin - y.pin)) {
      if (it.pin >= 0 && !pins.includes(it.address)) pins.splice(Math.min(it.pin, pins.length), 0, it.address);
    }
    this.setPins(pins);
    cx.notify();
    for (const it of undo.items) await this.write(it.address, { [SETTLED]: it[SETTLED], [SNOOZED]: it[SNOOZED] });
  }

  // Works out the shelves from the labels, and brings agents back: a settled one
  // when it or a sub-agent works or waits for you, or a turn has ended since
  // (also while no window was open); a snoozed one when it is due (with a
  // notification) or blocked (without).
  inbox(list, all, rankOf, now, cx) {
    this.shelf = new Map();
    this.finished = new Set();
    this.inflight ??= new Set();
    const effects = [];
    const bringBack = (address, key, after) => {
      const id = `${address}:${key}`;
      if (this.inflight.has(id)) return;
      this.inflight.add(id);
      effects.push(async () => {
        try { if (await this.write(address, { [key]: "" })) after?.(); } finally { this.inflight.delete(id); }
      });
    };
    for (const a of list) {
      const term = this.terms.get(a.address);
      const statuses = [a.status, ...kidStatuses(all, a.address, this.listed)];
      const blocked = statuses.includes("blocked") || statuses.includes("error");
      const busy = blocked || statuses.includes("working");
      if (!busy && rankOf(a) !== RANK.working) this.finished.add(a.address);
      if (a.focused && this.woke.delete(a.address)) localStorage.setItem("woke", JSON.stringify([...this.woke]));
      const settled = parseSettled(this.label(a.address, SETTLED));
      if (settled) {
        if (busy || (term?.turn ?? 0) > settled.turn) bringBack(a.address, SETTLED);
        else this.shelf.set(a.address, { kind: "settled", at: settled.at });
        continue;
      }
      const wake = parseSnoozed(this.label(a.address, SNOOZED));
      if (wake === null) continue;
      if (blocked) bringBack(a.address, SNOOZED);
      else if (now >= wake) bringBack(a.address, SNOOZED, () => {
        this.woke.add(a.address);
        localStorage.setItem("woke", JSON.stringify([...this.woke]));
        notify({ title: "Snooze over", body: [a.space_name, a.tab_name].filter(Boolean).join(" · ") || a.address, level: "info", action: { name: "agent.focus", args: { terminal: a.address } } });
      });
      else this.shelf.set(a.address, { kind: "snoozed", wake });
    }
    // Written from a timer, never while drawing.
    if (effects.length) cx.timer.after(0, (cx) => cx.spawn(async (cx) => { for (const f of effects) await f(); cx.notify(); }));
  }

  // After putting away the agent in view, shows the card below it (from the last, the first).
  moveOn(addresses) {
    const order = this.activeOrder ?? [];
    const i = order.findIndex((a) => a.focused);
    if (i < 0 || !addresses.includes(order[i].address)) return;
    const next = [...order.slice(i + 1), ...order.slice(0, i)].find((a) => !addresses.includes(a.address));
    if (next) run("pane.focus", { pane: next.pane });
  }

  // ctrl-shift-s: settles the agent in view when it is finished, or brings it back.
  async settleInView(cx) {
    // The agent block's agent, else the focused terminal: one that reports no
    // status has no agent block, and a settled one isn't among the active rows.
    const f = focused();
    const address = [f?.agent, f?.terminal].find((a) => a && this.rows?.has(a));
    if (!address) return;
    const shelf = this.shelf?.get(address);
    if (shelf?.kind === "settled") return this.write(address, { [SETTLED]: "" });
    if (shelf?.kind === "snoozed") return this.write(address, { [SNOOZED]: "" });
    if (!this.finished?.has(address)) {
      notify({ title: "Not finished yet", body: "Only an agent that is done or idle can be settled.", level: "info", timeout: 3000 });
      return;
    }
    return this.putAway([address], "Settled", (a) => ({ [SETTLED]: `${Date.now()}:${this.terms?.get(a)?.turn ?? 0}`, [SNOOZED]: "" }), cx);
  }

  // Types a one-line pointer to an agent into the agent in view, without Enter.
  // It goes through the clipboard, which gets its old text back afterwards.
  reference(address, cx) {
    const target = focused()?.terminal;
    if (!target || target === address) {
      notify({ title: "Show another agent first", body: "The reference is typed into the agent in view.", level: "info", timeout: 3000 });
      return;
    }
    const a = agents().find((x) => x.address === address);
    const pane = panes().find((p) => p.terminal === address);
    const tab = spaces().flatMap((s) => s.tabs).find((t) => t.id === a?.tab);
    const text = reference({ address, title: tab ? title(tab, lead(tab)) : a?.title, cwd: pane?.cwd, home: home() });
    const old = cx.read_from_clipboard();
    cx.write_to_clipboard(text);
    run("terminal.paste");
    // Only text comes back; a slow paste could still read the old text.
    if (old !== undefined) cx.timer.after(500, (cx) => cx.write_to_clipboard(old));
  }

  // Closes the panes of settled agents, after a second click. Not the one in
  // view or its tab, and never a space's last pane (pane.close refuses it).
  clearSettled(members, cx) {
    const now = Date.now();
    if (!(this.clearAsk > now)) {
      this.clearAsk = now + CLEAR_ASK_MS;
      cx.timer.after(CLEAR_ASK_MS + 50, (cx) => cx.notify());
      return;
    }
    this.clearAsk = 0;
    const tab = focused()?.tab;
    const spaceOf = new Map(spaces().flatMap((s) => s.tabs.map((t) => [t.id, s.id])));
    const left = new Map();
    for (const p of panes()) left.set(spaceOf.get(p.tab), (left.get(spaceOf.get(p.tab)) ?? 0) + 1);
    let closed = 0, kept = 0;
    for (const a of members) {
      if (a.focused || a.tab === tab) { kept++; continue; }
      const space = spaceOf.get(a.tab);
      if ((left.get(space) ?? 0) <= 1) { kept++; continue; }
      run("pane.close", { pane: a.pane });
      left.set(space, left.get(space) - 1);
      closed++;
    }
    notify({
      title: closed ? `Closed ${closed} settled agent${closed === 1 ? "" : "s"}` : "Nothing to close",
      body: kept ? `Kept ${kept}: in view, or the last pane in its space.` : undefined,
      level: closed ? "success" : "info",
      timeout: 4000,
    });
  }

  // Opens the row menu: everything (right-click), or only the snooze times (the clock).
  openMenu(a, snoozeOnly) {
    const finished = this.finished?.has(a.address) ?? false;
    const blocked = (this.urgency?.get(a.address) ?? 0) === RANK.blocked;
    const opts = { snoozeOnly, finished, blocked, pinned: this.pins.includes(a.address) };
    openOverlay({ mod: "agent-list", kind: "popup", width: 250, height: menuHeight(menuItems(a.address, opts)), props: { rowMenu: a.address, ...opts } });
  }

  rowMenu(t) {
    const p = props();
    const act = (it) => {
      setShared(ACTION, { kind: it.kind, address: p.rowMenu, preset: it.preset, at: Date.now() });
      run("agent-list.act");
      closeOverlay(p.overlay);
    };
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .children(menuItems(p.rowMenu, p).map((it, i) => it.heading
        ? div().px(8).pt(8).h(26).flex_none().text_size(11).text_color(t.dim).child(it.heading)
        : h_flex()
          .id(`menu-${i}`)
          .h(MENU_ROW)
          .px(8)
          .gap(9)
          .flex_none()
          .rounded(7)
          .items_center()
          .text_color(t.foreground)
          .hover((el) => el.bg(t.hover))
          .on_click(() => act(it))
          .child(svg(it.icon).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().truncate().child(it.label))
          .when(Boolean(it.hint), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(it.hint)))));
  }

  overview(cx) {
    const existing = panes().find((p) => p.mod === "agent-list");
    if (existing) { run("pane.focus", { pane: existing.pane }); return; }
    if (this.opening) return;
    const space = spaces().find((s) => s.active);
    if (!space) return;
    this.opening = true;
    run("tab.new", { name: "Agents", space: space.id, mod: "agent-list", props: { overview: true } });
    let attempts = 0;
    const check = (cx) => {
      const pane = panes().find((p) => p.mod === "agent-list");
      if (pane) { run("tab.move", { id: pane.tab, index: 1 }); this.opening = false; return; }
      if (++attempts < 20) cx.timer.after(100, check);
      else this.opening = false;
    };
    cx.timer.after(100, check);
  }

  // Viewing a done agent makes it idle; that must not reset its status timer.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      const was = this.changed[a.address];
      if (was?.s === s) continue;
      // The core's status time is only as of the app's start, so it seeds an
      // agent seen for the first time and is never read again.
      const core = this.terms?.get(a.address)?.status_ms;
      const at = was || !Number.isFinite(core) || core > now ? now : core;
      this.changed[a.address] = { s, at, prev: was?.s ?? null };
      dirty = true;
    }
    if (!dirty) return;
    // The agent list can be empty during startup, so retain recent timestamps.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  // Drops pins of agents that ended. Only for machines the list has heard from:
  // right after a start, or while a machine connects, its agents aren't listed yet.
  prunePins(all) {
    const machine = (addr) => (addr.includes("/") ? addr.split("/")[0] : "");
    const heard = new Set(all.map((k) => machine(k.address)));
    const live = new Set(all.filter((k) => k.state === "live").map((k) => k.address));
    const kept = this.pins.filter((p) => !heard.has(machine(p)) || live.has(p));
    if (kept.length !== this.pins.length) this.setPins(kept);
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Keep completed agents in Done until focus leaves, so rows do not move mid-click.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a, now = Date.now()) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    const r = sawDone ? RANK.done : RANK[a.status] ?? 0;
    // Blocked leaves Working at once; anything else waits out the grace.
    const c = this.changed?.[a.address];
    if (r !== RANK.blocked && r !== RANK.working && c?.prev === "working" && now - c.at < GRACE) {
      this.graced = true;
      return RANK.working;
    }
    return r;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(helperName(k)))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    // A slow, dim spinner and the count: the agent itself waits on its helpers.
    if (a.waiting) return h_flex().id(`waiting-${a.address}`).flex_none().gap(3).items_center().text_color(t.dim)
      .tooltip(`Waiting on ${a.waiting} helper${a.waiting === 1 ? "" : "s"}`)
      .child(svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).text_color(t.dim).spin(1800))
      .when(!compact, (el) => el.child(div().text_size(10.5).child(String(a.waiting))));
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.overview) return overview(this.expanded);
    if (props()?.sortMenu) return this.sortMenu(t);
    if (props()?.rowMenu) return this.rowMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    const all = terminals();
    let list = agents();
    const unreported = unreportedAgents(list, all, panes(), spaces(), this.rawTitles);
    this.unreported = unreported.map((a) => a.address);
    list = [...list, ...unreported];
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    this.terms = new Map(all.map((k) => [k.address, k]));
    const inView = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    this.graced = false;
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a, now), ...kidStatuses(all, a.address, this.listed).map((s) => RANK[s] ?? 0))]));
    this.urgency = urgency;
    const rankOf = (a) => urgency.get(a.address);
    if (this.graced && !this.graceTimer) {
      this.graceTimer = true;
      cx.timer.after(GRACE + 50, (cx) => { this.graceTimer = false; cx.notify(); });
    }
    this.inbox(list, all, rankOf, now, cx);
    // Use tab numbers only when space and title would otherwise be ambiguous.
    const tabs = spaces().flatMap(s => s.tabs);
    const label = (a) => {
      const tab = tabs.find(tab => tab.id === a.tab);
      return tab ? title(tab, lead(tab)) : a.title || a.program?.name || "";
    };
    const spaceAt = new Map(spaces().map((s, i) => [s.id, i]));
    const byName = (x, y) => `${x.space_name ?? ""} ${label(x)}`.localeCompare(`${y.space_name ?? ""} ${label(y)}`, undefined, { numeric: true, sensitivity: "base" });
    list = [...list].sort(byPriority
      ? (x, y) => rankOf(y) - rankOf(x) || byName(x, y)
      : (x, y) => (spaceAt.get(x.space) ?? 0) - (spaceAt.get(y.space) ?? 0) || byName(x, y));
    this.prunePins(all);
    const shelved = (kind) => list.filter((a) => this.shelf.get(a.address)?.kind === kind);
    const snoozed = shelved("snoozed").sort((x, y) => this.shelf.get(x.address).wake - this.shelf.get(y.address).wake);
    const settled = shelved("settled").sort((x, y) => this.shelf.get(y.address).at - this.shelf.get(x.address).at);
    list = list.filter((a) => !this.shelf.has(a.address));
    const pinned = this.pins.map((p) => list.find((a) => a.address === p)).filter(Boolean);
    const rest = list.filter((a) => !this.pins.includes(a.address));
    list = [...pinned, ...rest];
    this.activeOrder = list;
    this.rows = new Set([...list, ...snoozed, ...settled].map((a) => a.address));
    setAgentOrder([...list, ...snoozed, ...settled].map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, inView, byPriority))];
    };

    // Closed groups show the descendant count and highest-priority status.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    const detail = new Map(list.map(a => [a.address, DIGITS_RE.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const waits = waitingOn(a, all, this.listed);
      const shown = waits ? { ...a, waiting: waits } : a;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, shown, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused && !waits;
      const isPinned = this.pins.includes(a.address);
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.setPins(isPinned ? this.pins.filter((p) => p !== a.address) : [...this.pins, a.address]);
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      const button = (id, glyph, tip, onClick) => div()
        .id(`${id}-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(tip)
        .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
        .child(svg(glyph).size(13));
      const blocked = rankOf(a) === RANK.blocked;
      const actions = h_flex().flex_none().gap(1).items_center()
        .when(!blocked, (el) => el.child(button("snooze", "mods/workspace-chrome/clock.svg", "Snooze", () => this.openMenu(a, true))))
        .when(this.finished.has(a.address), (el) => el.child(button("settle", "mods/workspace-chrome/check.svg", "Settle", (cx) =>
          cx.spawn(async (cx) => this.putAway([a.address], "Settled", (x) => ({ [SETTLED]: `${Date.now()}:${this.terms?.get(x)?.turn ?? 0}`, [SNOOZED]: "" }), cx)))))
        .child(pin);
      const woke = this.woke.has(a.address);
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (DIGITS_RE.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openMenu(a, false); })
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(woke && this.hovered !== a.address, el => el.child(div().flex_none().text_size(10.5).font_medium().text_color(t.accent).child("Woke")))
        .when(this.hovered === a.address, el => el.child(actions))
        .when(this.hovered !== a.address && !woke && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .when(Boolean(a.unreported), el => el.child(div().id(`unreported-${a.address}`).flex_none().text_size(10.5).text_color(t.dim)
          .tooltip("Not reporting to Herdr; status read from its title").child("?")))
        .child(this.status(t, shown, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }
    if (snoozed.length) groups.push({ id: "inbox-snoozed", label: "Snoozed", status: null, members: snoozed, shelf: true });
    if (settled.length) groups.push({ id: "inbox-settled", label: "Settled", status: null, members: settled, shelf: true });

    // A slim row on a shelf: muted, with how long ago it was settled or when it
    // wakes; hovered, a button that brings it back.
    const shelfRow = (a) => {
      const info = this.shelf.get(a.address);
      const hovered = this.hovered === a.address;
      const pic = icon(a.program, 16, t.foreground);
      const name = label(a);
      const key = info.kind === "settled" ? SETTLED : SNOOZED;
      const back = div()
        .id(`back-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(info.kind === "settled" ? "Un-settle" : "Wake now")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.hovered = null;
          cx.spawn(async (cx) => { await this.write(a.address, { [key]: "" }); cx.notify(); });
          cx.notify();
        })
        .child(svg(UNDO_ICON).size(13));
      return h_flex()
        .id(`shelf-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openMenu(a, false); })
        .when(Boolean(pic), (el) => el.child(div().opacity(a.focused || hovered ? 1 : 0.5).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(120).truncate().text_color(t.muted).child(a.space_name || name))
          .when(Boolean(a.space_name) && !DIGITS_RE.test(name), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${name}`))))
        .child(hovered ? back : div().flex_none().text_size(11).text_color(t.dim)
          .child(info.kind === "settled" ? duration(now - info.at) : wakeLabel(info.wake, now)));
    };

    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open || g.shelf, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(g.id === "inbox-settled", (el) => {
          const asking = this.clearAsk > now;
          return el.child(div()
            .id("inbox-clear")
            .px(5)
            .rounded(4)
            .text_color(asking ? t.blocked : t.dim)
            .hover((s) => s.bg(t.hover).text_color(asking ? t.blocked : t.foreground))
            .tooltip("Close the panes of settled agents")
            .on_click((_e, cx) => { cx.stop_propagation(); this.clearSettled(g.members, cx); cx.notify(); })
            .child(asking ? `Close ${g.members.length}?` : "Clear"));
        })
        .when(!open, (el) => el
          .when(!byPriority && !g.shelf && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => {
        // A folded shelf still shows the agent in view.
        const members = this.folded.has(g.id) ? g.members.filter((a) => g.shelf && a.focused) : g.members;
        return [header(g), ...(g.shelf ? members.map(shelfRow) : members.flatMap(withKids))];
      });
    const undo = this.undo && now < this.undo.until ? this.undo : null;
    const resumable = collapsed ? [] : this.resumable(t, now);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(
              h_flex().gap(10).items_center()
                .child(div().id("agents-overview").text_color(t.dim).cursor_pointer()
                  .hover((s) => s.text_color(t.foreground))
                  .tooltip("Open all agent sessions").accessibility_label("Open all agent sessions")
                  .on_click((_e, cx) => this.overview(cx)).child(svg(ICON).size(14)))
                .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "agent-list", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14))),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed && !resumable.length, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children([...resumable, ...rows]))
      .when(Boolean(undo) && !collapsed, (el) => el.child(h_flex()
        .mx(8)
        .mb(6)
        .px(10)
        .h(30)
        .flex_none()
        .rounded(8)
        .bg(t.raised)
        .items_center()
        .gap(8)
        .text_size(12)
        .child(div().flex_1().truncate().text_color(t.muted).child(`${undo.verb} ${undo.items.length} agent${undo.items.length === 1 ? "" : "s"}`))
        .child(div()
          .id("inbox-undo")
          .px(6)
          .rounded(5)
          .text_color(t.foreground)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => cx.spawn(async (cx) => this.undoLast(cx)))
          .child("Undo"))))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
