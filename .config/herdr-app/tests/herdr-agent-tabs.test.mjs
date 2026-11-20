import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

describe("agent-tabs", () => {
  const evaluate = loadMods(["agent-tabs/projects.js", "agent-tabs/main.js"]);
  const ids = (expression, values) => JSON.parse(evaluate(`JSON.stringify(${expression}.map((t) => t.id))`, values));
  const tab = (id, active = false) => ({ id, active });
  const agentPane = (tabId, terminal) => ({ tab: tabId, terminal, program: { agent: true } });

  it("hides a tab only when every agent in it is snoozed, and never the tab in view", () => {
    const space = { tabs: [tab("a"), tab("b"), tab("c"), tab("d", true), tab("e"), tab("f"), tab("g")] };
    const all = [
      agentPane("a", "t1"),
      agentPane("b", "t2"), agentPane("b", "t3"),
      { tab: "c", terminal: "t4", program: { shell: true } },
      agentPane("d", "t5"),
      agentPane("e", "t6"),
      agentPane("f", "t7"),
      { tab: "g", terminal: "t8", program: { agent: false }, status: null },
      { tab: "g", terminal: "t9", program: { shell: true }, status: null },
    ];
    const terms = new Map([
      ["t1", { labels: { "inbox.snoozed": "5000" } }],
      ["t2", { labels: { "inbox.snoozed": "5000" } }],
      ["t4", { labels: { "inbox.snoozed": "5000" } }],
      ["t5", { labels: { "inbox.snoozed": "5000" } }],
      ["t6", { labels: { "inbox.snoozed": "500" } }],
      ["t8", { labels: { "inbox.snoozed": "5000" } }],
    ]);
    const pending = { t7: { "inbox.snoozed": "5000", at: 900 } };
    assert.deepEqual(ids("visibleTabs(space.tabs, all, terms, pending, 1000)", { space, all, terms, pending }), ["b", "d", "e"]);
    assert.deepEqual(ids("visibleTabs(space.tabs, all, terms, pending, 9000)", { space, all, terms, pending }), ["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("hides a tab whose agents are all settled, until one works, needs you or starts a new turn", () => {
    const space = { tabs: [tab("a"), tab("b"), tab("c"), tab("d"), tab("e"), tab("f", true)] };
    const all = [
      agentPane("a", "t1"),
      agentPane("b", "t2"), agentPane("b", "t3"),
      { ...agentPane("c", "t4"), status: "working" },
      agentPane("d", "t5"),
      agentPane("e", "t6"),
      agentPane("f", "t7"),
    ];
    const settled = (turn, at = 100) => ({ labels: { "inbox.settled": `${at}:${turn}` } });
    const terms = new Map([
      ["t1", { ...settled(3), turn: 3 }],
      ["t2", { labels: { "inbox.snoozed": "5000" } }], ["t3", { ...settled(1), turn: 1 }],
      ["t4", { ...settled(2), turn: 2 }],
      ["t5", { ...settled(2), turn: 3 }],
      ["t6", { labels: {}, turn: 0 }],
      ["t7", { ...settled(0), turn: 0 }],
    ]);
    const pending = { t6: { "inbox.settled": "900:0", at: 900 } };
    // a: settled; b: one snoozed, one settled; c: works again; d: a newer turn; e: just settled; f: in view.
    assert.deepEqual(ids("visibleTabs(space.tabs, all, terms, pending, 1000)", { space, all, terms, pending }), ["c", "d", "f"]);
  });

  it("numbers and steps through the tabs the bar shows", () => {
    const tabs = [tab("a"), tab("c", true), tab("e")];
    assert.equal(evaluate('tabFor("select-2", tabs).id', { tabs }), "c");
    assert.equal(evaluate('tabFor("select-4", tabs)', { tabs }), null);
    assert.equal(evaluate('tabFor("next", tabs).id', { tabs }), "e");
    assert.equal(evaluate('tabFor("prev", tabs).id', { tabs }), "a");
    assert.equal(evaluate('tabFor("next", [tabs[2], tabs[1]]).id', { tabs }), "e");
    assert.equal(evaluate('tabFor("other", tabs)', { tabs }), null);
  });

  it("moves one tab per wheel notch, and one per stretch of a touchpad swipe", () => {
    const steps = (events) => {
      const swipe = { acc: 0, steps: 0, at: 0, last: 0 };
      return events.map(([e, now]) => evaluate("wheelStep(swipe, e, now)", { swipe, e, now }));
    };
    assert.deepEqual(steps([[{ delta_lines: { y: 1 } }, 1000], [{ delta_lines: { y: -1 } }, 1001], [{ delta_lines: { y: 0 } }, 1002]]), ["prev", "next", null]);
    // Small moves add up to one tab; the rest of the swipe needs 60 px a tab, at most one per 100 ms.
    const swipe = [5, 5, 5, 5, 20, 20, 20, 20].map((y, i) => [{ delta: { y }, touch_phase: "moved" }, 1000 + i * 30]);
    assert.deepEqual(steps(swipe), [null, null, null, "prev", null, null, null, "prev"]);
    // A pause starts a new gesture.
    assert.deepEqual(steps([[{ delta: { y: -25 } }, 1000], [{ delta: { y: -25 } }, 1500]]), ["next", "next"]);
  });

  it("shows the selected project's tabs from every space and machine, with the focused one active", () => {
    const spaces = [
      { id: "sp1", active: true, tabs: [{ id: "a", active: true }, { id: "b" }] },
      { id: "sp2", tabs: [{ id: "c", active: true }] },
      { id: "vps/sp1", machine: "vps", tabs: [{ id: "vps/d", active: true }, { id: "vps/e" }] },
    ];
    const all = [
      { tab: "a", terminal: "t1" }, { tab: "b", terminal: "t2" }, { tab: "c", terminal: "t3" },
      { tab: "vps/d", terminal: "vps/t4" }, { tab: "vps/e", terminal: "vps/t5" },
    ];
    const terms = new Map([
      ["t2", { address: "t2", labels: { project: "github.com/o/x" } }],
      ["vps/t4", { address: "vps/t4", labels: { project: "github.com/o/x" } }],
      ["vps/t5", { address: "vps/t5", labels: { project: "github.com/o/deleted" } }],
    ]);
    const projects = [{ id: "github.com/o/x", name: "x" }, { id: "github.com/o/deleted", name: "d", deleted: true }];
    const pending = { t3: { project: "github.com/o/x", at: 900 } };
    const bar = (selected, focused) => JSON.parse(evaluate("JSON.stringify(projectBarTabs(spaces, all, terms, projects, selected, focused, pending, 1000))", { spaces, all, terms, projects, pending, selected, focused }))
      .map((t) => [t.id, t.space, t.active]);
    // Each space keeps its own active tab: only the focused one counts.
    assert.deepEqual(bar("github.com/o/x", "vps/d"), [["b", "sp1", false], ["c", "sp2", false], ["vps/d", "vps/sp1", true]]);
    // A tab labelled with a deleted project is in General; an unknown selection falls back to General.
    assert.deepEqual(bar("general", "a"), [["a", "sp1", true], ["vps/e", "vps/sp1", false]]);
    assert.deepEqual(bar("github.com/o/deleted", "a"), bar("general", "a"));
  });

  it("turns the main stack to the start page while the project has no tab, asking once", () => {
    const ran = [];
    const shared = {};
    const tabs = loadMods(["agent-tabs/projects.js", "agent-tabs/main.js"], {
      run: (...args) => { ran.push(args); }, setShared: (key, value) => { shared[key] = value; },
    });
    const view = tabs("Object.create(Tabs.prototype)");
    const stack = (active) => ({ id: "main-stack", type: "stack", active, children: [{ id: "main" }, { id: "project-start" }] });
    const sync = (node, want, now) => tabs("view.syncMain(node, want, now)", { view, node, want, now });
    sync(stack("main"), "project-start", 1000);
    sync(stack("main"), "project-start", 1500);
    assert.deepEqual(JSON.parse(JSON.stringify(ran)), [["layout.select", { stack: "main-stack", child: "project-start" }]]);
    assert.equal(shared["projects.start-shown"], 1000);
    // The layout caught up; a new tab turns it back, without marking a turn to the page.
    sync(stack("project-start"), "project-start", 1600);
    sync(stack("project-start"), "main", 1700);
    assert.deepEqual(JSON.parse(JSON.stringify(ran[1])), ["layout.select", { stack: "main-stack", child: "main" }]);
    assert.equal(shared["projects.start-shown"], 1000);
    // A layout without the stack, or without that child, is left alone.
    sync(null, "project-start", 2000);
    sync({ id: "main-stack", children: [{ id: "main" }] }, "project-start", 2000);
    assert.equal(ran.length, 2);
  });

  it("counts a tab opened from the start page in the project once the sidebar labels it", () => {
    const store = loadMods(["projects/membership.js", "projects/store.js"]);
    const before = [{ tab: "a", terminal: "t1" }];
    const after = [...before, { tab: "new", terminal: "t2" }];
    const fresh = store("freshTerminals(seen, ready, after)", { seen: new Set(["t1"]), ready: new Set([null]), after });
    const writes = JSON.parse(store('JSON.stringify(autoLabels(fresh, after, () => "", "github.com/o/x"))', { fresh, after }));
    assert.deepEqual(writes, [{ address: "t2", project: "github.com/o/x" }]);
    const spaces = [{ id: "sp1", tabs: [{ id: "a", active: true }, { id: "new" }] }];
    const projects = [{ id: "github.com/o/x", name: "x" }];
    const child = (pending) => evaluate('mainChild(projectBarTabs(spaces, after, new Map(), projects, "github.com/o/x", "a", pending, 1000))', { spaces, after, projects, pending });
    assert.equal(child(null), "project-start");
    assert.equal(child({ t2: { project: "github.com/o/x", at: 900 } }), "main");
  });

  it("starts with no remembered panels when the saved value is corrupt", () => {
    assert.equal(evaluate('JSON.stringify(savedObject("{oops"))'), "{}");
    assert.equal(evaluate('JSON.stringify(savedObject("[1]"))'), "{}");
    assert.equal(evaluate("JSON.stringify(savedObject(null))"), "{}");
    assert.equal(evaluate('JSON.stringify(savedObject("{\\"sp1\\":\\"files\\"}"))'), '{"sp1":"files"}');
  });
});
