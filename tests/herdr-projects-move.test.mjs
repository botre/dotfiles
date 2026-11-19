import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const ONE = "github.com/o/one";
const TWO = "github.com/o/two";
const LIST = [
  { id: TWO, name: "Two", icon: { favicon: "https://two.example" }, updated_at: 1 },
  { id: ONE, name: "One", icon: { emoji: "\u{1F680}" }, updated_at: 1 },
  { id: "github.com/o/gone", name: "Gone", icon: {}, deleted: true, updated_at: 1 },
];

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
const t = new Proxy({}, { get: (_, name) => `#${String(name)}` });

describe("move to project helpers", () => {
  const evaluate = loadMods(["projects/membership.js"]);
  const run = (expression, values) => plain(evaluate(`(${expression})`, values));

  it("draws a favicon once downloaded, else the emoji as text, else a letter tile, and nothing for General", () => {
    const favicons = { "https://two.example": "data/projects/favicons/abc.png" };
    assert.deepEqual(run("projectIcon(p, favicons)", { p: LIST[0], favicons }), { favicon: "data/projects/favicons/abc.png" });
    assert.deepEqual(run("projectIcon(p, {})", { p: { ...LIST[0], icon: { favicon: "https://two.example", emoji: "x" } } }), { emoji: "x" });
    assert.deepEqual(run("projectIcon(p, {})", { p: LIST[1] }), { emoji: "\u{1F680}" });
    const tile = run("projectIcon(p, {})", { p: { id: ONE, name: " one", icon: {} } });
    assert.equal(tile.letter, "O");
    assert.equal(tile.color, evaluate("tileColor(id)", { id: ONE }));
    assert.equal(run("projectIcon(generalProject(), {})"), null);
  });

  it("labels every terminal of the tab with the project, and removes the label for General", () => {
    const panes = [
      { tab: "tb1", terminal: "t1" }, { tab: "tb1", terminal: "t2" }, { tab: "tb1", terminal: null, mod: "files" },
      { tab: "tb2", terminal: "t3" },
    ];
    assert.deepEqual(run("moveCommands(panes, 'tb1', id)", { panes, id: ONE }), [["label", "t1", `project=${ONE}`], ["label", "t2", `project=${ONE}`]]);
    assert.deepEqual(run("moveCommands(panes, 'tb1', 'general')", { panes }), [["label", "t1", "project="], ["label", "t2", "project="]]);
    assert.deepEqual(run("moveCommands(panes, 'tb9', id)", { panes, id: ONE }), []);
  });

  it("lists General, then the live projects by name, in a popup sized to them", () => {
    assert.deepEqual(run("pickerProjects(list).map((p) => p.name)", { list: LIST }), ["General", "One", "Two"]);
    const o = run("pickerOverlay('tb1', list)", { list: LIST });
    assert.deepEqual(o, { mod: "projects", kind: "popup", width: 260, height: o.height, props: { picker: "tb1" } });
    assert.equal(o.height, 10 + 26 + 3 * 31 + 2 * 2);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `h/o/${i}`, name: `P${i}`, updated_at: 1 }));
    assert.equal(run("pickerOverlay('tb1', many).height", { many }), 10 + 26 + 10 * 31 + 9 * 2);
  });
});

describe("move to project", () => {
  const setup = ({ panes = [{ tab: "tb1", terminal: "t1" }, { tab: "tb1", terminal: "vps/t2" }], fail = false, labels = {} } = {}) => {
    const shared = { "projects.list": LIST, "projects.selected": TWO, "projects.favicons": {} };
    const hcCalls = [], notes = [], ran = [], closed = [];
    const evaluate = loadMods(["projects/membership.js", "projects/store.js", "projects/start.js", "projects/main.js"], {
      div: () => element("div"), h_flex: () => element("h_flex"), v_flex: () => element("v_flex"),
      svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
      theme: () => t, shared: (key) => shared[key], setShared: (key, value) => { shared[key] = value; },
      panes: () => panes, spaces: () => [{ id: "sp1", tabs: [{ id: "tb1" }, { id: "tb2" }] }],
      terminals: () => panes.map((p) => ({ address: p.terminal, labels: labels[p.terminal] ?? {} })),
      hc: async (args) => { hcCalls.push(args); return fail ? { code: 1, stderr: "nope" } : { code: 0 }; },
      notify: (n) => { notes.push(n); }, run: (...args) => { ran.push(args); }, closeOverlay: (id) => { closed.push(id); },
      home: () => "/home/me", checking: () => true,
    });
    const view = evaluate("Object.create(Projects.prototype)");
    view.projects = LIST;
    return { evaluate, view, shared, hcCalls, notes, ran, closed };
  };

  it("relabels every terminal of the tab, keeps the selection, and says where it went", async () => {
    const { view, shared, hcCalls, notes } = setup();
    await view.moveTab("tb1", ONE);
    assert.deepEqual(plain(hcCalls), [["label", "t1", `project=${ONE}`], ["label", "vps/t2", `project=${ONE}`]]);
    assert.equal(shared["projects.selected"], TWO);
    assert.equal(shared["projects.pending"].t1.project, ONE);
    assert.deepEqual(plain(notes), [{ title: "Moved to One", level: "success", timeout: 3000 }]);
  });

  it("removes the label for General, shown at once as pending", async () => {
    const { view, shared, hcCalls, notes } = setup();
    await view.moveTab("tb1", "general");
    assert.deepEqual(plain(hcCalls), [["label", "t1", "project="], ["label", "vps/t2", "project="]]);
    assert.equal(shared["projects.pending"]["vps/t2"].project, "");
    assert.equal(notes[0].title, "Moved to General");
  });

  it("reports a failed label and ignores a project that is gone", async () => {
    const failing = setup({ fail: true });
    await failing.view.moveTab("tb1", ONE);
    assert.equal(failing.notes[0].level, "error");
    const gone = setup();
    await gone.view.moveTab("tb1", "github.com/o/gone");
    assert.deepEqual(gone.hcCalls, []);
  });

  it("runs a move handed over by a popup or the strip", async () => {
    const { view, shared, hcCalls } = setup();
    shared["projects.action"] = { kind: "move", tab: "tb1", id: ONE, at: Date.now() };
    await view.act({ notify() {} });
    assert.equal(hcCalls.length, 2);
    assert.equal(shared["projects.action"], null);
  });

  it("draws the picker with icons, marks the current project, and moves with the keyboard", () => {
    const { view, shared, ran, closed } = setup({ labels: { t1: { project: TWO } } });
    const p = { picker: "tb1", overlay: "o1" };
    view.initPicker(p, { focus_handle: () => ({ focus() {} }) });
    assert.equal(view.at, 2, "starts on the tab's project");
    const tree = view.renderPicker(p);
    const text = JSON.stringify(tree.calls);
    for (const s of ["Move to project", "General", "One", "Two"]) assert.ok(text.includes(JSON.stringify(s)), s);
    assert.match(text, /svg mods\/workspace-chrome\/layers\.svg/, "General's icon");
    assert.ok(text.includes(JSON.stringify("\u{1F680}")), "an emoji draws as text");
    assert.equal((text.match(/check\.svg/g) ?? []).length, 1);
    const handler = tree.calls.find((c) => c[0] === "on_key_down")[1];
    const cx = { stop_propagation() {}, notify() {} };
    handler({ key: "down" }, cx);
    assert.equal(view.at, 0, "down wraps to General");
    handler({ key: "down" }, cx);
    handler({ key: "enter" }, cx);
    assert.deepEqual(closed, ["o1"]);
    assert.equal(shared["projects.action"].kind, "move");
    assert.equal(shared["projects.action"].id, ONE);
    assert.equal(shared["projects.action"].tab, "tb1");
    assert.deepEqual(plain(ran), [["projects.act"]]);
  });

  it("only closes when the current project is chosen, or on Escape", () => {
    const { view, shared, ran, closed } = setup({ labels: { t1: { project: TWO } } });
    const p = { picker: "tb1", overlay: "o1" };
    view.initPicker(p, { focus_handle: () => ({ focus() {} }) });
    const handler = view.renderPicker(p).calls.find((c) => c[0] === "on_key_down")[1];
    handler({ key: "enter" }, { stop_propagation() {}, notify() {} });
    handler({ key: "escape" }, { stop_propagation() {}, notify() {} });
    assert.deepEqual(closed, ["o1", "o1"]);
    assert.equal(shared["projects.action"], undefined);
    assert.deepEqual(ran, []);
  });
});
