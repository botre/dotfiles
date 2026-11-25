import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, memoryStorage } from "./mod-source.mjs";

// The projects list and the agents list share one grid (projects/membership.js):
// the same row padding, icon slot, gap to the name, and a status slot at the
// right edge with the count just before it.

// Elements that record their builder calls; `when` applies its callback.
const element = (kind) => {
  const calls = [{ kind }];
  const proxy = new Proxy({}, { get: (_, name) => name === "calls" ? calls : (...args) => {
    if (name === "when") return args[0] ? args[1](proxy) : proxy;
    calls.push([name, ...args.map((x) => x?.calls ?? (Array.isArray(x) ? x.map((y) => y?.calls ?? y) : x))]);
    return proxy;
  } });
  return proxy;
};
const builders = {
  div: () => element("div"), h_flex: () => element("h_flex"), v_flex: () => element("v_flex"),
  svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
};
const t = { foreground: "#fff", muted: "#aaa", dim: "#777", working: "#0a0", blocked: "#f00", done: "#00f", idle: "#888", selected: "#333", hover: "#222" };

// The first recorded element that `test` accepts, anywhere in a tree.
function findIn(calls, test) {
  if (!Array.isArray(calls)) return null;
  if (calls[0]?.kind && test(calls)) return calls;
  for (const c of calls) {
    if (!Array.isArray(c)) continue;
    for (const arg of c.slice(1)) {
      const found = findIn(arg, test) ?? (Array.isArray(arg) ? arg.map((x) => findIn(x, test)).find(Boolean) : null);
      if (found) return found;
    }
  }
  return null;
}
const has = (calls, name, value) => calls.some((c) => Array.isArray(c) && c[0] === name && (value === undefined || c[1] === value));
const byId = (calls, id) => findIn(calls, (el) => has(el, "id", id));
const value = (calls, name) => calls.find((c) => Array.isArray(c) && c[0] === name)?.[1];

// A row's layout: its own sizing calls, the icon slot's, and the trail's, in order.
const SIZING = new Set(["h", "w", "px", "pl", "pr", "gap", "rounded", "items_center", "justify_center", "flex_none", "flex_1"]);
const sizing = (calls) => calls.filter((c) => Array.isArray(c) && SIZING.has(c[0]));
const children = (calls) => calls.filter((c) => Array.isArray(c) && (c[0] === "child" || c[0] === "children"))
  .flatMap((c) => (c[0] === "child" ? [c[1]] : c[1]));
function layoutOf(row) {
  const [icon, , trail] = children(row);
  const kids = children(trail);
  return { row: sizing(row), icon: sizing(icon), trail: sizing(trail), slot: sizing(kids.at(-1)), details: kids.length - 1 };
}

const ONE = "github.com/o/one";
const PROJECTS = [{ id: ONE, name: "One", icon: { emoji: "\u{1F680}" }, updated_at: 1 }];

function projectRow(status = "working", count = 2) {
  const evaluate = loadMods(["projects/membership.js", "projects/store.js", "projects/start.js", "projects/main.js"], {
    ...builders, shared: () => undefined,
  });
  const view = evaluate("new Projects()");
  view.favicons = {};
  return view.row(PROJECTS[0], t, false, status, count).calls;
}

function agentRows(extra = {}, renders = 1, prep = () => {}) {
  const store = { "projects.list": PROJECTS };
  const terms = extra.terms ?? [{ address: "t1", state: "live", labels: { project: ONE } }];
  const evaluate = loadMods(["agent-list/projects.js", "agent-list/inbox.js", "agent-list/move.js", "agent-list/main.js"], {
    ...builders,
    ICON: "mods/agent-list/agents.svg",
    theme: () => t, props: () => ({}), layout: () => ({ id: "root", children: [{ id: "sidebar", size: { px: 268 } }] }),
    terminals: () => terms,
    agents: () => [{ address: "t1", status: "working", pane: "p1", space: "sp1", space_name: "daily", tab: "tb1", tab_name: "Work", program: { name: "Claude Code" }, seq: 1 }],
    panes: () => [{ pane: "p1", tab: "tb1", terminal: "t1", program: { name: "Claude Code", agent: true } }],
    spaces: () => [{ id: "sp1", name: "daily", tabs: [{ id: "tb1", name: "Work", named: true }] }],
    focused: () => null, shared: (key) => store[key], setShared: (key, value) => { store[key] = value; },
    setAgentOrder: () => null, localStorage: memoryStorage(), keys: () => [], machines: () => [],
    ...extra,
  });
  const view = evaluate("new Agents()");
  Object.assign(view, { folded: new Set(), changed: {}, woke: new Set(), rawTitles: new Map() });
  prep(view);
  const cx = { notify() {}, spawn() {}, timer: { after() {} } };
  for (let i = 1; i < renders; i++) view.render(cx);
  return view.render(cx).calls;
}

describe("sidebar grid", () => {
  it("draws project rows and agent rows with the same padding, icon slot, gap and status slot", () => {
    const project = layoutOf(projectRow());
    const tree = agentRows();
    const agent = layoutOf(byId(tree, "ag-t1"));
    assert.deepEqual(agent.row, project.row);
    assert.deepEqual(agent.icon, project.icon);
    assert.deepEqual(agent.slot, project.slot);
    assert.deepEqual(project.row, [["h", 30], ["px", 8], ["gap", 9], ["flex_none"], ["items_center"], ["rounded", 8]]);
    assert.deepEqual(project.icon.slice(0, 2), [["w", 18], ["h", 18]]);
    assert.deepEqual(project.slot.slice(0, 2), [["w", 18], ["h", 18]]);
  });

  it("puts the status slot last, with the count just before it", () => {
    const row = projectRow("working", 3);
    const trail = children(row).at(-1);
    const kids = children(trail);
    assert.equal(kids.length, 2);
    assert.ok(JSON.stringify(kids[0]).includes('"child","3"'), "the count");
    assert.ok(JSON.stringify(kids[1]).includes("spinner.svg"), "then the status");
    // Idle, the slot stays and stays empty, so names and counts don't move.
    const idle = children(children(projectRow("idle", 0)).at(-1));
    assert.equal(idle.length, 1);
    assert.deepEqual(sizing(idle[0]).slice(0, 2), [["w", 18], ["h", 18]]);
    assert.equal(children(idle[0]).length, 0);
  });

  it("leaves the count and status off a project's group header", () => {
    const header = byId(agentRows(), "pj-github.com/o/one");
    const text = JSON.stringify(header);
    assert.ok(!text.includes("spinner.svg"));
    assert.ok(!text.includes('"child","1"'));
    assert.deepEqual(sizing(header).find((c) => c[0] === "px"), ["px", 8]);
  });

  it("shows Parked's Clear only under the pointer, with the count right-aligned in the status column", () => {
    const terms = [{ address: "t1", state: "live", labels: { project: ONE, "inbox.settled": "5:0" } }];
    const agents = () => [{ address: "t1", status: "idle", pane: "p1", space: "sp1", space_name: "daily", tab: "tb1", tab_name: "Work", program: { name: "Claude Code" }, seq: 1 }];
    const quiet = agentRows({ terms, agents });
    const header = byId(quiet, "inbox-settled");
    assert.ok(header, "the Parked shelf shows");
    // At the bottom of the panel, below the scrolling list.
    assert.ok(byId(byId(quiet, "ag-shelves"), "inbox-settled"));
    assert.equal(byId(byId(quiet, "ag-list"), "inbox-settled"), null);
    assert.ok(!byId(quiet, "inbox-clear"));
    const count = children(header).at(-1);
    assert.equal(value(count, "w"), 18);
    assert.ok(has(count, "justify_end"));
    assert.equal(value(count, "pr"), 3);
    const hovered = agentRows({ terms, agents }, 1, (view) => { view.hovered = "hdr-inbox-settled"; });
    assert.ok(byId(hovered, "inbox-clear"));
  });

  it("keeps list rows and menu rows on the same gap, and section titles on the row edge", () => {
    const evaluate = loadMods(["projects/membership.js"]);
    const grid = evaluate("GRID"), menu = evaluate("MENU");
    assert.equal(grid.rowGap, menu.gap);
    const tree = agentRows();
    assert.equal(value(byId(tree, "ag-list"), "gap"), grid.rowGap);
    // "Agents" starts where row content does, and has no overview button any more.
    const title = findIn(tree, (el) => has(el, "justify_between") && has(el, "pt", 10));
    assert.equal(value(title, "pl"), grid.listPx + grid.rowPx);
    assert.equal(byId(tree, "agents-overview"), null);
  });

  it("hands Herdr the agent order once, not on every draw", () => {
    const orders = [];
    agentRows({ setAgentOrder: (list) => { orders.push(list); return null; } }, 3);
    assert.equal(orders.length, 1);
    assert.deepEqual([...orders[0]], ["t1"]);
  });

  it("draws an emoji with a pixel line height, centred in its box", () => {
    const evaluate = loadMods(["projects/membership.js"], builders);
    const calls = JSON.stringify(evaluate("projectIconView(ui, t, { emoji: '\u{1F680}' }, 18)", { ui: builders, t }).calls);
    assert.match(calls, /"line_height","14px"\]/);
    assert.match(calls, /"items_center".*"justify_center"/);
  });
});
