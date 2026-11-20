import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, memoryStorage, plain } from "./mod-source.mjs";

describe("agent-list titles and saved values", () => {
  const evaluate = loadMod("agent-list");
  const tab = (name, named = true) => ({ id: "tb1", name, named });
  const claude = { name: "Claude Code", key: "claude" };

  it("keeps a title's leading bracket or quote and drops Codex's attention mark", () => {
    const clean = (s) => evaluate(`clean(${JSON.stringify(s)})`);
    assert.equal(clean("[web] login flow"), "[web] login flow");
    assert.equal(clean("✳ [web] login flow"), "[web] login flow");
    assert.equal(clean("“Quoted” task"), "“Quoted” task");
    assert.equal(clean("[ ! ] Fix flaky tests"), "Fix flaky tests");
    assert.equal(clean("[ . ] Fix flaky tests"), "Fix flaky tests");
  });

  it("shows an unnamed tab's terminal title, and keeps a name the person gave", () => {
    const title = (t, l) => evaluate("title(t, l)", { t, l });
    const lead = { terminal: "t1", title: "✳ Fix flaky tests", program: claude };
    assert.equal(title(tab("2", false), lead), "Fix flaky tests");
    assert.equal(title(tab("Claude Code"), lead), "Fix flaky tests");
    assert.equal(title(tab("Billing"), lead), "Billing");
  });

  it("keeps the tab name when the title is a path, user@host or the terminal address", () => {
    const title = (live) => evaluate("title(t, l)", { t: tab("3", false), l: { terminal: "t7", title: live, program: claude } });
    assert.equal(title("✳ ~/dev/dotfiles"), "3");
    assert.equal(title("✳ /tmp/work"), "3");
    assert.equal(title("me@box: ~"), "3");
    assert.equal(title("t7"), "3");
  });

  it("finds each tab's lead pane in one pass: an agent, else the focused terminal, else the first", () => {
    const all = [
      { tab: "a", terminal: "t1" }, { tab: "a", terminal: "t2", focused: true }, { tab: "a", terminal: "t3", program: { agent: true } },
      { tab: "b", terminal: "t4" }, { tab: "b", terminal: "t5", focused: true },
      { tab: "c", terminal: "t6" }, { tab: "c" },
    ];
    const leads = plain(evaluate("Object.fromEntries([...leadPanes(all)].map(([k, p]) => [k, p.terminal]))", { all }));
    assert.deepEqual(leads, { a: "t3", b: "t5", c: "t6" });
  });

  it("gives agents that share a tab their own titles", () => {
    const tabs = new Map([["tb1", { id: "tb1", name: "Work", named: true }], ["tb2", { id: "tb2", name: "Docs", named: true }]]);
    const list = [
      { address: "t1", tab: "tb1", title: "Fix flaky tests", program: claude },
      { address: "t2", tab: "tb1", title: "Review payments", program: claude },
      { address: "t3", tab: "tb2", title: "Write notes", program: claude },
      { address: "t4", tab: "gone", title: "", program: claude },
    ];
    const leads = new Map([["tb2", { terminal: "t3", title: "Write notes", program: claude }]]);
    const labels = plain(evaluate("Object.fromEntries(agentLabels(list, tabs, leads))", { list, tabs, leads }));
    assert.deepEqual(labels, { t1: "Fix flaky tests", t2: "Review payments", t3: "Docs", t4: "Claude Code" });
  });

  it("nests a kept sub-agent under its parent so it shows once", () => {
    const all = [
      { address: "t1", state: "live" },
      { address: "t2", parent: "t1", state: "live" },
      { address: "t3", parent: "t2", state: "live" },
      { address: "t4", parent: "t1", state: "exited" },
      { address: "t5", state: "live" },
    ];
    const parents = [{ address: "t1" }, { address: "t2" }, { address: "t5" }];
    assert.deepEqual(plain([...evaluate("nestedAgents(parents, all)", { parents, all })]).sort(), ["t2", "t3"]);
  });

  it("falls back to empty values when a saved value is corrupt or the wrong kind", () => {
    assert.deepEqual(plain(evaluate('saved("{not json", {})')), {});
    assert.deepEqual(plain(evaluate('saved("[1]", {})')), {});
    assert.deepEqual(plain(evaluate('saved("null", {})')), {});
    assert.deepEqual(plain(evaluate("saved(null, [])")), []);
    assert.deepEqual(plain(evaluate('saved("{\\"t1\\":1}", [])')), []);
    assert.deepEqual(plain(evaluate('saved("[\\"t1\\"]", [])')), ["t1"]);
    assert.deepEqual(plain(evaluate('saved("{\\"t1\\":{\\"s\\":\\"idle\\"}}", {})')), { t1: { s: "idle" } });
  });

  it("starts with corrupt saved `changed` and `woke` values", () => {
    const evaluate = loadMod("agent-list", {
      props: () => ({}),
      SessionTracker: class { sync() {} },
      localStorage: memoryStorage({ changed: "{oops", woke: '{"t1":true}' }),
    });
    const view = evaluate("new Agents()");
    view.init({}, { spawn() {}, timer: { every() {} } });
    assert.deepEqual(plain(view.changed), {});
    assert.equal(view.woke.size, 0);
  });
});
