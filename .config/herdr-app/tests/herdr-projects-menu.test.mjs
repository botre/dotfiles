import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const ID = "github.com/o/repo";
const claude = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: true, installed: true, run: ["claude"] };
const codex = { key: "codex", name: "Codex", icon: null, tint: false, installed: true, run: ["codex"] };
const cursor = { key: "cursor", name: "Cursor", icon: "icons/cursor.svg", tint: true, installed: false, run: ["cursor-agent"] };
const copilot = { key: "copilot", name: "Copilot", icon: "icons/copilot.svg", tint: true, installed: false, run: ["copilot"] };
const amp = { key: "amp", name: "Amp", icon: "icons/amp.svg", tint: true, installed: false, run: ["amp"] };
const PROJECT = { id: ID, name: "Repo", icon: {}, shown: false, updated_at: 1 };

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

const setup = ({ dirs = { "": { [ID]: "/home/me/repo" } }, cached = { "": [claude, codex, cursor, copilot, amp] }, asked = [] } = {}) => {
  const store = { "projects.list": [PROJECT], "projects.dirs": dirs, "new-menu.agents": cached };
  const ran = [], overlays = [], closed = [];
  const evaluate = loadMods(["projects/membership.js", "projects/store.js", "projects/start.js", "projects/main.js"], {
    div: () => element("div"), h_flex: () => element("h_flex"), v_flex: () => element("v_flex"),
    svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
    theme: () => new Proxy({}, { get: (_, name) => `#${String(name)}` }),
    shared: (key) => store[key], setShared: (key, value) => { store[key] = value; },
    spaces: () => [{ id: "sp1", active: true, machine: null, tabs: [] }], machines: () => [], home: () => "/home/me",
    keys: () => [{ section: "global", action: "tab.new", keys: "ctrl-shift-t" }],
    knownAgents: async (o) => { asked.push(o); return [claude]; },
    run: (...args) => { ran.push(args); }, openOverlay: (o) => { overlays.push(o); }, closeOverlay: (id) => { closed.push(id); },
  });
  const view = evaluate("Object.create(Projects.prototype)");
  Object.assign(view, { handle: { focus() {} }, at: 0 });
  return { evaluate, view, store, ran, overlays, closed };
};

describe("project menu", () => {
  it("offers the New menu's terminal, agents and worktrees, then the project's own actions", () => {
    const { evaluate, view } = setup();
    const { items } = plain(evaluate("view.menuModel(p)", { view, p: { project: ID, agents: [claude, codex, cursor, copilot, amp] } }));
    const names = items.map((it) => it.divider ? "line" : it.heading ?? it.label);
    assert.deepEqual(names, ["New terminal", "Start an agent", "Claude Code", "Codex", "Cursor", "Copilot", "line",
      "New worktree…", "Open worktree…", "line", "Show in list", "Edit…", "line", "Delete"]);
    assert.deepEqual(items.filter((it) => it.kind === "agent").map((it) => [it.hint, it.enabled]),
      [["1", true], ["2", true], ["Not installed", false], ["Not installed", false]]);
    assert.equal(items[0].hint, "ctrl-shift-t");
    assert.ok(names.every((n) => n !== "New space"));
    const text = JSON.stringify(evaluate("view.renderMenu(p)", { view, p: { project: ID, agents: [claude, codex, cursor] } }).calls);
    for (const s of ["New terminal", "Start an agent", "Codex", "Not installed", "Open worktree…", "Delete"]) assert.ok(text.includes(JSON.stringify(s)), s);
    assert.match(text, /svg mods\/agent-list\/icons\/claude\.svg/);
  });

  it("gives Scratch and All only the terminal and agents, started at home in Scratch", () => {
    for (const project of ["general", "all"]) {
      const { evaluate, view, store, ran } = setup();
      const p = { project, agents: [claude, cursor], overlay: "m1" };
      const { items, place } = evaluate("view.menuModel(p)", { view, p });
      assert.deepEqual(plain(items).map((it) => it.heading ?? it.label), ["New terminal", "Start an agent", "Claude Code", "Cursor"], project);
      evaluate("view.chooseMenu(items[0], p, place)", { view, p, items, place });
      // The selection stays on the row picked; a new tab under either joins Scratch.
      assert.equal(store["projects.action"].id, project);
      assert.equal(plain(ran)[1][0], "tab.new");
      assert.equal(plain(ran)[1][1].folder, "/home/me");
    }
  });

  it("greys out the worktrees for a project without a folder", () => {
    const { evaluate, view } = setup({ dirs: {} });
    const { items } = plain(evaluate("view.menuModel(p)", { view, p: { project: ID, agents: [claude] } }));
    assert.deepEqual(items.filter((it) => it.kind === "worktree").map((it) => it.enabled), [false, false]);
    assert.ok(items.find((it) => it.kind === "terminal").enabled);
  });

  it("starts an agent in the project's folder, after selecting the project so its tab joins it", () => {
    const { evaluate, view, store, ran, closed } = setup();
    const p = { project: ID, agents: [claude, codex], overlay: "m1" };
    const { items, place } = evaluate("view.menuModel(p)", { view, p });
    evaluate("view.chooseMenu(items.find((it) => it.id === 'agent-codex'), p, place)", { view, p, items, place });
    assert.deepEqual(closed, ["m1"]);
    assert.equal(store["projects.action"].kind, "select");
    assert.equal(store["projects.action"].id, ID);
    assert.deepEqual(plain(ran), [["projects.act"], ["tab.new", { folder: "/home/me/repo", argv: ["codex"], space: "sp1", name: "Codex" }]]);
  });

  it("opens the worktree dialog for the project's folder", () => {
    const { evaluate, view, overlays } = setup();
    const p = { project: ID, agents: [], overlay: "m1" };
    const { items, place } = evaluate("view.menuModel(p)", { view, p });
    evaluate("view.chooseMenu(items.find((it) => it.id === 'worktree-open'), p, place)", { view, p, items, place });
    assert.deepEqual(plain(overlays[0]), { mod: "worktree-org", kind: "dialog", width: 560, height: 480, props: { folder: "/home/me/repo", machine: null, action: "open" } });
  });

  it("sizes the popup for its rows, asking for the agents only when none are cached", async () => {
    const asked = [];
    const { evaluate, view, overlays, store } = setup({ cached: {}, asked });
    await evaluate("view.menu(proj)", { view, proj: PROJECT });
    assert.equal(asked.length, 1);
    assert.deepEqual(plain(store["new-menu.agents"][""]), [claude]);
    const o = plain(overlays[0]);
    assert.deepEqual(o.props, { menu: true, project: ID, agents: [claude] });
    assert.equal(o.width, 250);
    // 5 + [terminal 31, heading 26, Claude 31, line 9, two worktrees 62, line 9, show and edit 62, line 9, delete 31] + 10 gaps of 2 + 5
    assert.equal(o.height, 5 + 31 + 26 + 31 + 9 + 62 + 9 + 62 + 9 + 31 + 10 * 2 + 5);
    await evaluate("view.menu(proj)", { view, proj: PROJECT });
    assert.equal(asked.length, 1, "the second menu uses the cached list");
  });
});
