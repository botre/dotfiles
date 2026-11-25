import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const ID = "github.com/o/repo";
const claude = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: true, installed: true, run: ["claude"] };
const codex = { key: "codex", name: "Codex", icon: null, tint: false, installed: true, run: ["sh", "-c", "herdr-codex"] };

describe("project start page", () => {
  const evaluate = loadMods(["projects/membership.js", "projects/start.js"]);
  const run = (expression, values) => plain(evaluate(`(${expression})`, values));

  it("shows the start page while the selected project has no tab", () => {
    assert.equal(run("mainChild([])"), "project-start");
    assert.equal(run("mainChild(null)"), "project-start");
    assert.equal(run('mainChild([{ id: "tb1" }])'), "main");
  });

  it("starts in the project's folder, the machine in view first, and only on connected machines", () => {
    const dirs = { "": { [ID]: "/home/me/repo" }, vps: { [ID]: "/srv/repo", "github.com/o/far": "/srv/far" }, gone: { "github.com/o/old": "/old" } };
    const place = (id, inView, ready = ["vps"]) => run("startPlace(dirs, id, inView, ready, '/home/me')", { dirs, id, inView, ready });
    assert.deepEqual(place(ID, "vps"), { folder: "/srv/repo", machine: "vps", known: true });
    assert.deepEqual(place(ID, null), { folder: "/home/me/repo", machine: null, known: true });
    assert.deepEqual(place("github.com/o/far", null), { folder: "/srv/far", machine: "vps", known: true });
    assert.deepEqual(place("github.com/o/far", null, []), { folder: "/home/me", machine: null, known: false });
    assert.deepEqual(place("github.com/o/old", null), { folder: "/home/me", machine: null, known: false });
    // General starts at home, and home is its folder.
    assert.deepEqual(place("general", "vps"), { folder: "/home/me", machine: null, known: true });
    // So does All.
    assert.deepEqual(place("all", "vps"), { folder: "/home/me", machine: null, known: true });
  });

  it("offers the installed agents, a terminal, and worktrees only for a project with a folder", () => {
    const agents = run("startAgents(known)", { known: [{ key: "amp", installed: true }, { ...codex }, { ...claude }, { key: "gemini", installed: false }] });
    assert.deepEqual(agents.map((a) => a.key), ["claude", "codex"]);
    assert.deepEqual(run("startAgents(known)", { known: [{ ...claude, installed: false }] }), []);
    const ids = (id, place) => run("startActions(id, place, agents)", { id, place, agents }).map((a) => a.id);
    const all = ["agent-claude", "agent-codex", "terminal", "worktree-new", "worktree-open"];
    assert.deepEqual(ids(ID, { folder: "/r", machine: null, known: true }), all);
    assert.deepEqual(ids(ID, { folder: "/home/me", machine: null, known: false }), ["agent-claude", "agent-codex", "terminal"]);
    assert.deepEqual(ids("general", { folder: "/home/me", machine: null, known: true }), ["agent-claude", "agent-codex", "terminal"]);
    assert.equal(run("startActions(id, place, agents)[0].label", { id: ID, place: { known: true }, agents }), "Start Claude Code");
  });

  it("opens tabs in a space on the folder's machine, or a new space there", () => {
    const spaces = [
      { id: "sp1", tabs: [] },
      { id: "sp2", active: true, tabs: [] },
      { id: "vps/sp3", machine: "vps", tabs: [] },
    ];
    const command = (item, place, all = spaces) => run("startCommand(item, place, all)", { item, place, all });
    const here = { folder: "/home/me/repo", machine: null, known: true };
    const there = { folder: "/srv/repo", machine: "vps", known: true };
    const agent = { kind: "agent", agent: claude };
    const terminal = { kind: "terminal" };
    assert.deepEqual(command(agent, here), ["tab.new", { folder: "/home/me/repo", argv: ["claude"], space: "sp2", name: "Claude Code" }]);
    assert.deepEqual(command(terminal, there), ["tab.new", { folder: "/srv/repo", space: "vps/sp3" }]);
    assert.deepEqual(command(terminal, here, [spaces[2]]), ["space.new", { folder: "/home/me/repo", machine: "" }]);
    assert.deepEqual(command(agent, there, []), ["space.new", { folder: "/srv/repo", argv: ["claude"], machine: "vps", tab: "Claude Code" }]);
    const dialog = run("worktreeOverlay(item, there)", { item: { kind: "worktree", action: "open" }, there });
    assert.deepEqual(dialog, { mod: "worktree-org", kind: "dialog", width: 560, height: 480, props: { folder: "/srv/repo", machine: "vps", action: "open" } });
  });

  it("puts the start page in the bjorn layout's main stack, showing the tab by default", () => {
    const layout = JSON.parse(readFileSync(new URL("../layouts/bjorn.json", import.meta.url), "utf8"));
    const find = (node, id) => node?.id === id ? node : (node?.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null;
    const stack = find(layout, "main-stack");
    assert.equal(stack.type, "stack");
    assert.equal(stack.active, "main");
    assert.deepEqual(stack.children.map((c) => c.id), ["main", "project-start"]);
    assert.deepEqual(find(layout, "project-start").content, { mod: "projects", props: { start: true } });
    assert.equal(find(layout, "main").content.tab, "active");
  });
});

describe("project start page render", () => {
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

  const render = ({ selected, dirs = {}, list = [], spaces = [{ id: "sp1", active: true, tabs: [] }], at = 0 }) => {
    const shared = { "projects.selected": selected, "projects.list": list, "projects.dirs": dirs, "projects.start-shown": 1 };
    const ran = [];
    const overlays = [];
    let focused = 0;
    const evaluate = loadMods(["projects/membership.js", "projects/store.js", "projects/start.js", "projects/main.js"], {
      div: () => element("div"), h_flex: () => element("h_flex"), v_flex: () => element("v_flex"),
      svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
      theme: () => t, shared: (key) => shared[key], setShared: (key, value) => { shared[key] = value; },
      spaces: () => spaces, machines: () => [], home: () => "/home/me", window: () => ({ platform: "linux" }),
      checking: () => true, run: (...args) => { ran.push(args); }, openOverlay: (o) => { overlays.push(o); },
    });
    const view = evaluate("Object.create(Projects.prototype)");
    Object.assign(view, {
      handle: { focus: () => { focused++; } }, at, shownAt: 1, asked: new Set(),
      agentLists: { "": [claude, codex] },
    });
    const cx = { notify() {}, stop_propagation() {}, spawn(f) { f(cx); } };
    const tree = evaluate("view.renderStart(cx)", { view, cx });
    return { text: JSON.stringify(tree.calls), tree, view, cx, ran, overlays, focused: () => focused, shared };
  };

  it("draws a project with its repo and every action as a pill", () => {
    const list = [{ id: ID, name: "Repo", icon: { emoji: "\u{1F680}" }, updated_at: 1 }];
    const { text } = render({ selected: ID, list, dirs: { "": { [ID]: "/home/me/code/repo" } } });
    for (const s of ["Repo", "o/repo", "Start Claude Code", "Start Codex", "New terminal", "New worktree…", "Open worktree…"]) assert.ok(text.includes(JSON.stringify(s)), s);
    assert.match(text, /"w",240\],\["h",38\]/);
    assert.match(text, /"rounded",19\],\["border",1\]/);
    assert.match(text, /svg mods\/workspace-chrome\/terminal\.svg/);
    assert.doesNotMatch(text, /No folder/);
  });

  it("draws General at home without a repo or worktrees", () => {
    const { text } = render({ selected: "general" });
    assert.ok(text.includes('"Scratch"'));
    assert.doesNotMatch(text, /worktree|git-branch|No folder/);
    assert.ok(text.includes('"New terminal"'));
  });

  it("notes a project without a folder and starts at home", () => {
    const list = [{ id: ID, name: "Repo", icon: {}, updated_at: 1 }];
    const { text } = render({ selected: ID, list });
    assert.match(text, /No folder for this project on a connected machine/);
    assert.doesNotMatch(text, /worktree/);
    assert.ok(text.includes('"New terminal"'));
  });

  it("takes the keyboard when the tab bar turns to it, and moves and chooses with the arrows and enter", () => {
    const list = [{ id: ID, name: "Repo", icon: {}, updated_at: 1 }];
    const dirs = { "": { [ID]: "/home/me/code/repo" } };
    const again = render({ selected: ID, list, dirs });
    assert.equal(again.focused(), 0, "no new turn, so the keyboard stays where it is");
    again.shared["projects.start-shown"] = 2;
    const view = again.view;
    const tree = view.renderStart(again.cx);
    assert.equal(again.focused(), 1);
    assert.equal(view.at, 0);
    const handler = tree.calls.find((c) => c[0] === "on_key_down")[1];
    const key = (k) => handler({ key: k, modifiers: {} }, again.cx);
    key("up");
    assert.equal(view.at, 4, "up wraps to the last action");
    key("down"); key("down"); key("down");
    assert.equal(view.at, 2);
    key("enter");
    assert.deepEqual(plain(again.ran), [["tab.new", { folder: "/home/me/code/repo", space: "sp1" }]]);
    key("down"); key("enter");
    assert.deepEqual(plain(again.overlays).map((o) => [o.mod, o.props.action]), [["worktree-org", "new"]]);
  });
});
