import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const ONE = "github.com/o/one";
const TWO = "github.com/o/two";
const PROJECTS = [
  { id: ONE, name: "One", icon: { emoji: "\u{1F680}" }, updated_at: 1 },
  { id: TWO, name: "Two", icon: {}, updated_at: 1 },
  { id: "github.com/o/gone", name: "Gone", icon: {}, deleted: true, updated_at: 1 },
];
const CLAUDE = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", agent: true };
const mods = (path) => readFileSync(new URL(`../.config/herdr-app/mods/${path}`, import.meta.url), "utf8");

// Elements that record their builder calls; `when` applies its callback.
const element = (kind) => {
  const calls = [{ kind }];
  const proxy = new Proxy({}, { get: (_, name) => name === "calls" ? calls : (...args) => {
    if (name === "when") return args[0] ? args[1](proxy) : proxy;
    calls.push([name, ...args.map((x) => x?.calls ?? x)]);
    return proxy;
  } });
  return proxy;
};

describe("project suggestion", () => {
  const evaluate = loadMods(["project-suggest/projects.js", "project-suggest/main.js"]);
  const suggest = (address, current, remote, dismissed = {}) => plain(evaluate("suggestion(address, current, remote, projects, dismissed)", { address, current, remote, projects: PROJECTS, dismissed }))?.id ?? null;

  it("suggests the project whose remote the agent's folder has", () => {
    assert.equal(suggest("t1", "general", ONE), ONE);
    assert.equal(suggest("t1", TWO, ONE), ONE);
    assert.equal(suggest("t1", "", ONE), ONE, "no label is General");
  });

  it("stays quiet in the right project, without a project for the remote, or without a remote", () => {
    assert.equal(suggest("t1", ONE, ONE), null);
    assert.equal(suggest("t1", "general", "github.com/o/unknown"), null);
    assert.equal(suggest("t1", "general", "github.com/o/gone"), null);
    assert.equal(suggest("t1", TWO, null), null);
  });

  it("stays hidden for an agent once dismissed for that project", () => {
    assert.equal(suggest("t1", "general", ONE, { t1: ONE }), null);
    assert.equal(suggest("t2", "general", ONE, { t1: ONE }), ONE);
    assert.equal(suggest("t1", "general", ONE, { t1: TWO }), ONE);
  });

  it("keeps dismissals of live terminals only", () => {
    const live = new Set(["t1", "t2"]);
    assert.deepEqual(plain(evaluate("withDismissed(d, 't2', id, live)", { d: { t1: TWO, t9: ONE }, id: ONE, live })), { t1: TWO, t2: ONE });
  });

  it("finds the agent in view, with its folder and machine", () => {
    const spaces = [{ id: "vps/sp1", machine: "vps", tabs: [{ id: "vps/tb1" }] }, { id: "sp2", machine: null, tabs: [{ id: "tb2" }] }];
    const panes = [
      { terminal: "vps/t1", tab: "vps/tb1", cwd: "/srv/repo", program: CLAUDE },
      { terminal: "t2", tab: "tb2", cwd: "/home/me", program: { key: "shell", agent: false } },
    ];
    const at = (f, agents = []) => plain(evaluate("agentInView(f, panes, agents, spaces)", { f, panes, agents, spaces }));
    assert.deepEqual(at({ terminal: "vps/t1" }), { address: "vps/t1", tab: "vps/tb1", cwd: "/srv/repo", machine: "vps" });
    assert.equal(at({ terminal: "t2" }), null, "a shell is no agent");
    assert.deepEqual(at({ terminal: "t2" }, [{ address: "t2" }]).machine, null, "a reporting agent counts");
    assert.equal(at(null), null);
  });

  it("normalises remotes exactly as the projects mod does", () => {
    const body = (source) => source.slice(source.indexOf("export function normalizeRemote"), source.indexOf("\n}\n", source.indexOf("export function normalizeRemote")));
    assert.equal(body(mods("project-suggest/main.js")), body(mods("projects/store.js")));
    assert.equal(evaluate("normalizeRemote(url)", { url: "git@github.com:o/one.git\n" }), ONE);
  });

  it("sits under the main area, above the commands strip, with no height of its own", () => {
    const layout = JSON.parse(mods("../layouts/bjorn.json"));
    const find = (node, id) => node?.id === id ? node : (node?.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null;
    assert.deepEqual(find(layout, "main-column").children.map((c) => c.id), ["main-stack", "project-suggest", "commands"]);
    assert.deepEqual(find(layout, "project-suggest").content, { mod: "project-suggest" });
    assert.deepEqual(find(layout, "project-suggest").size, { px: 0 });
  });
});

describe("project suggestion strip", () => {
  const setup = ({ labels = {}, dismissed, stack = "main" } = {}) => {
    const store = { "projects.list": PROJECTS, "projects.move-dismissed": dismissed };
    const ran = [], execs = [];
    const panes = [{ pane: "p1", terminal: "t1", tab: "tb1", cwd: "/home/me/one", program: CLAUDE }, { pane: "p2", terminal: "t2", tab: "tb1", cwd: "/home/me/one" }];
    const evaluate = loadMods(["project-suggest/projects.js", "project-suggest/main.js"], {
      div: () => element("div"), h_flex: () => element("h_flex"),
      svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
      theme: () => new Proxy({}, { get: (_, name) => `#${String(name)}` }),
      spaces: () => [{ id: "sp1", machine: null, tabs: [{ id: "tb1" }] }], panes: () => panes,
      agents: () => [{ address: "t1", tab: "tb1" }], focused: () => ({ tab: "tb1", terminal: "t1", agent: null }),
      terminals: () => panes.map((p) => ({ address: p.terminal, labels: labels[p.terminal] ?? {} })),
      shared: (key) => store[key], setShared: (key, value) => { store[key] = value; },
      props: () => ({}), run: (...args) => { ran.push(args); },
      layout: () => ({ id: "root", children: [{ id: "main-stack", type: "stack", active: stack, children: [] }] }),
      exec: async (...args) => { execs.push(args); return { code: 0, stdout: "git@github.com:o/one.git\n" }; },
    });
    const view = evaluate("Object.create(ProjectSuggest.prototype)");
    Object.assign(view, { remotes: new Map(), shown: null, height: 0 });
    const spawned = [];
    const cx = { notify() {}, spawn: (f) => { spawned.push(f(cx)); } };
    const look = async () => { view.look(cx); await Promise.all(spawned.splice(0)); };
    return { view, cx, store, ran, execs, look };
  };

  it("reads the folder's remote once, then offers to move the agent there", async () => {
    const { view, cx, execs, ran, look } = setup({ labels: { t1: { project: TWO } } });
    await look();
    assert.deepEqual(plain(execs), [["git", ["remote", "get-url", "origin"], { cwd: "/home/me/one", on: null }]]);
    assert.equal(view.shown.proj.id, ONE);
    assert.deepEqual(plain(ran), [["layout.resize", { id: "project-suggest", px: 46 }]]);
    await look();
    assert.equal(execs.length, 1, "cached per folder");
    const text = JSON.stringify(view.render().calls);
    for (const s of ["This agent works in One.", "Move to One"]) assert.ok(text.includes(JSON.stringify(s)), s);
    assert.ok(text.includes(JSON.stringify("\u{1F680}")), "the project's emoji as text");
    assert.match(text, /close\.svg/);
  });

  it("hands Move to the projects sidebar and hides", async () => {
    const { view, cx, store, ran, look } = setup();
    await look();
    view.move(cx);
    assert.equal(store["projects.action"].kind, "move");
    assert.equal(store["projects.action"].tab, "tb1");
    assert.equal(store["projects.action"].id, ONE);
    assert.deepEqual(plain(ran.slice(1)), [["projects.act"], ["layout.resize", { id: "project-suggest", px: 0 }]]);
    assert.equal(view.shown, null);
  });

  it("remembers a dismissal for the agent", async () => {
    const { view, cx, store, look } = setup();
    await look();
    view.dismiss(cx);
    assert.deepEqual(plain(store["projects.move-dismissed"]), { t1: ONE });
    await look();
    assert.equal(view.shown, null);
  });

  it("shows nothing when the agent is in the right project already", async () => {
    const { view, ran, look } = setup({ labels: { t1: { project: ONE } } });
    await look();
    assert.equal(view.shown, null);
    assert.deepEqual(ran, []);
    assert.deepEqual(view.render().calls, [{ kind: "div" }]);
  });

  it("shows nothing under the start page, which hides the agent's tab", async () => {
    const { view, execs, look } = setup({ stack: "project-start" });
    await look();
    assert.equal(view.shown, null);
    assert.deepEqual(execs, []);
  });
});
