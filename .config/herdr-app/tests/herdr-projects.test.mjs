import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const evaluate = loadMods(["projects/membership.js", "projects/store.js", "projects/main.js"]);
const run = (expression, values) => plain(evaluate(`(${expression})`, values));
const mods = (path) => readFileSync(new URL(`../mods/${path}`, import.meta.url), "utf8");

describe("projects", () => {
  it("names a project after its normalised remote", () => {
    const cases = {
      "git@github.com:acme/monorepo.git": "github.com/acme/monorepo",
      "https://github.com/acme/monorepo.git": "github.com/acme/monorepo",
      "https://user:token@GitHub.com/acme/monorepo/": "github.com/acme/monorepo",
      "ssh://git@github.com:22/acme/monorepo.git": "github.com/acme/monorepo",
      "git+ssh://git@gitlab.example.com/group/sub/repo": "gitlab.example.com/group/sub/repo",
      "github.com:org/repo": "github.com/org/repo",
      "/home/me/repo": null,
      "file:///home/me/repo": null,
      "C:/repo": null,
      "": null,
    };
    for (const [url, id] of Object.entries(cases)) assert.equal(evaluate("normalizeRemote(url)", { url }), id, url);
    assert.equal(evaluate('nameOf("github.com/acme/monorepo")'), "monorepo");
  });

  it("merges machines' lists: the newest entry wins and a delete stays as a tombstone", () => {
    const here = [
      { id: "github.com/a/one", name: "One", icon: { emoji: "🚀" }, shown: false, updated_at: 100 },
      { id: "github.com/a/two", name: "Two", icon: {}, shown: true, updated_at: 300 },
    ];
    const there = [
      { id: "github.com/a/one", name: "One renamed", icon: {}, shown: true, updated_at: 200 },
      { id: "github.com/a/two", name: "Two", icon: {}, shown: true, updated_at: 250, deleted: true },
      { id: "github.com/a/three", name: "", updated_at: 50 },
      { id: "general", name: "Not a project", updated_at: 999 },
      { name: "no id" },
    ];
    const merged = run("mergeProjects(here, there)", { here, there });
    assert.deepEqual(merged.map((p) => [p.id, p.name, p.shown, Boolean(p.deleted)]), [
      ["github.com/a/one", "One renamed", true, false],
      ["github.com/a/three", "three", false, false],
      ["github.com/a/two", "Two", true, false],
    ]);
    // A later delete wins and stays, so other machines drop it too.
    const deleted = run('remove(merged, "github.com/a/one", 400)', { merged });
    const again = run("mergeProjects(deleted, there, here)", { deleted, there, here });
    assert.equal(again.find((p) => p.id === "github.com/a/one").deleted, true);
    assert.equal(run("liveProjects(again)", { again }).length, 2);
    // Saving it again brings it back, newer than the tombstone.
    const back = run('upsert(again, "github.com/a/one", { name: "Back" }, 300)', { again });
    assert.deepEqual(run('back.find((p) => p.id === "github.com/a/one")', { back }), { id: "github.com/a/one", name: "Back", icon: {}, shown: false, updated_at: 401 });
  });

  it("writes the merged list only to machines whose file differs", () => {
    const local = [{ id: "github.com/a/one", name: "One", icon: {}, shown: false, updated_at: 10 }];
    const text = evaluate("serialize(local)", { local });
    const reads = [{ machine: null, text }, { machine: "vps", text: null }, { machine: "box", text: "{corrupt" }];
    const plan = run("planSync(reads, local)", { reads, local });
    assert.deepEqual(plan.writes, ["vps", "box"]);
    assert.equal(plan.text, text);
    assert.deepEqual(run('parseStore("{oops")'), []);
  });

  it("lists General, then the shown projects, or else the five most recently active", () => {
    const p = (id, name, shown = false) => ({ id: `github.com/o/${id}`, name, icon: {}, shown, updated_at: 1 });
    const list = [p("a", "Alpha"), p("b", "Bravo"), p("c", "Charlie"), p("d", "Delta"), p("e", "Echo"), p("f", "Foxtrot"), { ...p("g", "Golf"), deleted: true }];
    const active = { "github.com/o/a": 1, "github.com/o/c": 9, "github.com/o/d": 8, "github.com/o/e": 7, "github.com/o/f": 6, "github.com/o/b": 5, "github.com/o/g": 99 };
    const names = (expression, values) => run(expression, values).map((x) => x.name);
    // Sorted by name, so ctrl+N stays put while recency moves.
    assert.deepEqual(names("listedProjects(list, active)", { list, active }), ["General", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]);
    const shown = list.map((x) => (x.name === "Alpha" || x.name === "Echo" ? { ...x, shown: true } : x));
    assert.deepEqual(names("listedProjects(shown, active)", { shown, active }), ["General", "Alpha", "Echo"]);
    assert.deepEqual(names('searchProjects(list, "ha")', { list }), ["Alpha", "Charlie"]);
    assert.deepEqual(names('searchProjects(list, "gen")', { list }), ["General"]);
    assert.equal(run('projectFor("select-2", listedProjects(shown, active)).name', { shown, active }), "Alpha");
    assert.equal(run('projectFor("select-9", listedProjects(shown, active))', { shown, active }), null);
  });

  it("puts a tab in the project its terminals are labelled with, else in General", () => {
    const spaces = [
      { id: "sp1", tabs: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] },
      { id: "vps/sp1", machine: "vps", tabs: [{ id: "vps/t1" }, { id: "vps/t2" }] },
    ];
    const panes = [
      { tab: "t1", terminal: "a" }, { tab: "t1", terminal: "b" },
      { tab: "t2", terminal: "c" },
      { tab: "t3", terminal: "d" },
      { tab: "vps/t1", terminal: "vps/a" },
      { tab: "vps/t2", terminal: "vps/b" },
    ];
    const terms = new Map([
      ["b", { address: "b", labels: { project: "github.com/o/x" } }],
      ["d", { address: "d", labels: { project: "github.com/o/gone" } }],
      ["vps/a", { address: "vps/a", labels: { project: "github.com/o/x" } }],
    ]);
    const known = new Set(["github.com/o/x", "github.com/o/y"]);
    // What was just written counts before hc has it.
    const pending = { "vps/b": { project: "github.com/o/y", at: 900 } };
    const map = run("[...tabProjects(spaces, panes, terms, known, pending, 1000)]", { spaces, panes, terms, known, pending });
    assert.deepEqual(map, [["t1", "github.com/o/x"], ["t2", "general"], ["t3", "general"], ["vps/t1", "github.com/o/x"], ["vps/t2", "github.com/o/y"]]);
    const tabs = run('projectTabs(spaces, "github.com/o/x", tabProjects(spaces, panes, terms, known, pending, 1000), "vps/t1")', { spaces, panes, terms, known, pending });
    assert.deepEqual(tabs.map((t) => [t.id, t.space, t.machine, t.active]), [["t1", "sp1", null, false], ["vps/t1", "vps/sp1", "vps", true]]);
  });

  it("labels a new tab with the selected project, and new panes with their tab's", () => {
    const seen = new Set(["a", "b", "c"]);
    const panes = [
      { tab: "old", terminal: "a" },
      { tab: "general", terminal: "b" },
      { tab: "labelled", terminal: "c" },
      { tab: "general", terminal: "split" },
      { tab: "labelled", terminal: "split2" },
      { tab: "new", terminal: "n1" }, { tab: "new", terminal: "n2" },
      { tab: "own", terminal: "n3" },
      { tab: "remote", terminal: "vps/r" },
    ];
    const labels = { c: "github.com/o/x", n3: "github.com/o/z" };
    const labelFor = (address) => labels[address] ?? "";
    // A machine that just connected brings its old terminals: they aren't new.
    const fresh = evaluate("freshTerminals(seen, new Set([null]), panes)", { seen, panes });
    assert.deepEqual([...fresh].sort(), ["n1", "n2", "n3", "split", "split2"]);
    const out = run('autoLabels(fresh, panes, labelFor, "github.com/o/y")', { fresh, panes, labelFor });
    assert.deepEqual(out, [
      { address: "split2", project: "github.com/o/x" },
      { address: "n1", project: "github.com/o/y" },
      { address: "n2", project: "github.com/o/y" },
    ]);
    // In General nothing is written; on the first look nothing is new (existing tabs stay in General).
    assert.deepEqual(run('autoLabels(fresh, panes, labelFor, "general")', { fresh, panes, labelFor }), [{ address: "split2", project: "github.com/o/x" }]);
    assert.equal(evaluate("freshTerminals(null, new Set([null]), panes).size", { panes }), 0);
  });

  it("follows focus into another project's tab, but not into a tab that just appeared", () => {
    const tabProject = new Map([["t1", "general"], ["t2", "github.com/o/x"]]);
    const follow = (tab, before, fresh, selected) => evaluate("followFocus(tab, before, tabProject, new Set(fresh), selected)", { tab, before, tabProject, fresh, selected });
    assert.equal(follow("t2", "t1", [], "general"), "github.com/o/x");
    assert.equal(follow("t2", "t2", [], "general"), null);
    assert.equal(follow("t2", "t1", ["t2"], "general"), null);
    assert.equal(follow("t1", "t2", [], "general"), null);
    assert.equal(evaluate('tabToShow([{ id: "a" }, { id: "b" }], "b").id'), "b");
    assert.equal(evaluate('tabToShow([{ id: "a" }, { id: "b" }], "gone").id'), "a");
  });

  it("records activity at most once a minute per project", () => {
    const active = { "github.com/o/x": 1000 };
    assert.equal(evaluate('touchActive(active, ["github.com/o/x", "general"], 30000) === active', { active }), true);
    assert.deepEqual(run('touchActive(active, ["github.com/o/x", "github.com/o/y"], 70000)', { active }), { "github.com/o/x": 70000, "github.com/o/y": 70000 });
    assert.deepEqual(active, { "github.com/o/x": 1000 });
  });

  it("reads icons, favicon sources and worktree folders", () => {
    assert.deepEqual(run('iconFrom(" https://example.com ")'), { favicon: "https://example.com" });
    assert.deepEqual(run('iconFrom("🚀")'), { emoji: "🚀" });
    assert.deepEqual(run('iconFrom("")'), {});
    assert.equal(evaluate('faviconSource("https://example.com/app?x=1")'), "https://example.com/favicon.ico");
    assert.equal(evaluate('faviconSource("https://cdn.x.io/logo.PNG")'), "https://cdn.x.io/logo.PNG");
    assert.equal(evaluate('faviconSource("javascript:alert(1)")'), null);
    assert.match(evaluate('faviconBase("https://example.com")'), /^[0-9a-f]{8}$/);
    assert.equal(evaluate('faviconBase("https://example.com")'), evaluate('faviconBase("https://example.com/")'));
    assert.equal(evaluate('faviconBase("ftp://x")'), null);
    assert.equal(evaluate('initial(" monorepo")'), "M");
    const dirs = { "": { x: "/home/me/x" }, vps: { x: "/srv/x", y: "/srv/y" } };
    assert.deepEqual(run('worktreeFolder(dirs, "x", "vps")', { dirs }), { folder: "/srv/x", machine: "vps" });
    assert.deepEqual(run('worktreeFolder(dirs, "x", null)', { dirs }), { folder: "/home/me/x", machine: null });
    assert.deepEqual(run('worktreeFolder(dirs, "y", null)', { dirs }), { folder: "/srv/y", machine: "vps" });
    assert.equal(run('worktreeFolder(dirs, "z", null)', { dirs }), null);
  });

  it("keeps the tab bar's, agents list's and suggestion strip's copies of membership.js identical", () => {
    const source = mods("projects/membership.js");
    assert.equal(mods("agent-tabs/projects.js"), source);
    assert.equal(mods("agent-list/projects.js"), source);
    assert.equal(mods("project-suggest/projects.js"), source);
  });

  it("binds ctrl+1..9 to projects and leaves the other keys", () => {
    const keys = JSON.parse(readFileSync(new URL("../keys.json", import.meta.url), "utf8")).global;
    for (let n = 1; n <= 9; n++) {
      assert.equal(keys[`ctrl-${n}`], `projects.select-${n}`);
      assert.equal(keys[`alt-${n}`], `agent-tabs.select-${n}`);
    }
    assert.equal(keys["ctrl-0"], "app.zoom_reset");
  });
});

describe("project agent count", () => {
  it("counts agents in the project's tabs, not its tabs", async () => {
    const { projectAgents } = await import("../mods/projects/membership.js");
    const tabs = [{ id: "tb1" }, { id: "tb2" }, { id: "tb3" }];
    const agents = [{ tab: "tb1" }, { tab: "tb2" }, { tab: "tb9" }];
    assert.equal(projectAgents(agents, tabs), 2);
  });
});

describe("favicon from a site", () => {
  it("finds a page's icons, apple-touch first, with hrefs made absolute", async () => {
    const { iconCandidates } = await import("../mods/projects/store.js");
    const html = `<head>
      <link href="https://cdn.example.com/a/icon.png" rel="shortcut icon" type="image/x-icon"/>
      <link rel='apple-touch-icon' href="/touch.png">
      <link rel="icon" href="favicon.svg">
      <link rel="mask-icon" href="/mask.svg">
      <link rel="stylesheet" href="/x.css">
      <link rel="icon" href="data:image/png;base64,AAAA"></head>`;
    assert.deepEqual(iconCandidates(html, "https://www.example.com/en/"), [
      "https://www.example.com/touch.png",
      "https://cdn.example.com/a/icon.png",
      "https://www.example.com/en/favicon.svg",
    ]);
    assert.deepEqual(iconCandidates("<link rel=icon href=//cdn.x.io/i.ico>", "http://a.b"), ["http://cdn.x.io/i.ico"]);
  });

  it("reads an image extension from a URL", async () => {
    const { imageExt } = await import("../mods/projects/store.js");
    assert.equal(imageExt("https://x.io/logo.JPEG?v=2"), "jpg");
    assert.equal(imageExt("https://www.example.com/"), null);
  });
});

