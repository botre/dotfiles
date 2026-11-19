import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const ONE = "github.com/o/one";
const TWO = "github.com/o/two";
const THREE = "github.com/o/three";
const PROJECTS = [
  { id: ONE, name: "One", icon: { emoji: "\u{1F680}" }, updated_at: 1 },
  { id: TWO, name: "Two", icon: { favicon: "https://two.example" }, updated_at: 1 },
  { id: THREE, name: "three", icon: {}, updated_at: 1 },
];
const CLAUDE = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, agent: true };

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

describe("agents list: project icons", () => {
  const evaluate = loadMods(["agent-list/projects.js", "agent-list/inbox.js", "agent-list/move.js", "agent-list/main.js"], {
    machines: () => [],
    div: () => element("div"), h_flex: () => element("h_flex"), v_flex: () => element("v_flex"),
    svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
  });
  const favicons = { "https://two.example": "data/projects/favicons/two.png" };
  const projectOf = new Map([["t1", ONE], ["t2", TWO], ["t3", THREE], ["t4", "general"], ["t5", "github.com/o/gone"]]);
  const pick = (address, favs = favicons) => plain(evaluate("rowIcon(a, projectOf, projects, favicons)", { a: { address, program: CLAUDE }, projectOf, projects: PROJECTS, favicons: favs }));
  const t = { foreground: "#fff" };
  const draw = (spec) => JSON.stringify(evaluate("drawRowIcon(spec, 16, t)", { spec, t }).calls);

  it("shows the project's emoji, favicon or letter tile in place of the program icon", () => {
    assert.deepEqual(pick("t1"), { emoji: "\u{1F680}" });
    assert.deepEqual(pick("t2"), { favicon: "data/projects/favicons/two.png" });
    const tile = pick("t3");
    assert.equal(tile.letter, "T");
    assert.match(tile.color, /^#[0-9a-f]{6}$/);
  });

  it("keeps the program icon in General, for a gone project, and while a favicon downloads", () => {
    assert.deepEqual(pick("t4"), { program: CLAUDE });
    assert.deepEqual(pick("t5"), { program: CLAUDE });
    assert.deepEqual(pick("t9"), { program: CLAUDE });
    assert.equal(pick("t2", {}).letter, "T");
  });

  it("draws each icon in the same 16px slot, an emoji as text", () => {
    const emoji = draw({ emoji: "\u{1F680}" });
    assert.match(emoji, /^\[\{"kind":"h_flex"\},\["w",16\],\["h",16\]/);
    assert.ok(emoji.includes(JSON.stringify("\u{1F680}")));
    assert.doesNotMatch(emoji, /image/);
    assert.match(draw({ favicon: "data/projects/favicons/two.png" }), /^\[\{"kind":"image data\/projects\/favicons\/two\.png"\},\["w",16\],\["h",16\]/);
    assert.match(draw({ letter: "T", color: "#22a99a" }), /\["w",16\],\["h",16\].*"bg","#22a99a".*"child","T"/);
    assert.match(draw({ program: CLAUDE }), /^\[\{"kind":"svg mods\/agent-list\/icons\/claude\.svg"\},\["size",16\]/);
  });
});

describe("agents list: move to project", () => {
  const setup = () => {
    const overlays = [], closed = [], store = { "projects.list": PROJECTS };
    const evaluate = loadMods(["agent-list/projects.js", "agent-list/inbox.js", "agent-list/move.js", "agent-list/main.js"], {
    machines: () => [],
      div: () => element("div"), h_flex: () => element("h_flex"), v_flex: () => element("v_flex"),
      svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
      terminals: () => [{ address: "t1", labels: {} }],
      panes: () => [{ pane: "p1", tab: "tb1", terminal: "t1" }],
      spaces: () => [{ id: "sp1", tabs: [{ id: "tb1" }] }],
      shared: (key) => store[key], setShared: (key, value) => { store[key] = value; },
      keys: () => [], props: () => ({ rowMenu: "t1", overlay: "m1" }), theme: () => ({}),
      openOverlay: (o) => { overlays.push(o); }, closeOverlay: (id) => { closed.push(id); }, run: () => {},
    });
    return { evaluate, overlays, closed, store };
  };

  it("offers Move to project in the row menu", () => {
    const { evaluate } = setup();
    const items = plain(evaluate('menuItems("t1", {})'));
    assert.ok(items.some((it) => it.kind === "project" && it.label === "Move to project…"));
  });

  it("opens the picker for the agent's tab instead of acting from the menu", () => {
    const { evaluate, overlays, closed, store } = setup();
    const tree = evaluate("Agents.prototype.rowMenu.call(Agents.prototype, {})");
    const items = plain(evaluate('menuItems("t1", {})'));
    const i = items.findIndex((it) => it.kind === "project");
    const row = tree.calls.find((c) => c[0] === "children")[1][i];
    const click = row.find((c) => c[0] === "on_click");
    assert.ok(click, "the row is clickable");
    // The recorded call holds the handler; run it.
    click[1]();
    assert.deepEqual(closed, ["m1"]);
    // The projects sidebar opens the picker once it has read the tab's repository.
    assert.deepEqual(plain(overlays), []);
    assert.equal(store["projects.action"].kind, "pick");
    assert.equal(store["projects.action"].tab, "tb1");
    assert.equal(store["agent-list.action"], undefined);
  });
});
