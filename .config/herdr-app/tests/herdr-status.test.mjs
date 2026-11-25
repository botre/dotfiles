import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

describe("status", () => {
  const evaluate = loadMods(["status/main.js"]);
  const checks = (rollup) => evaluate("checks(rollup)", { rollup });

  it("has no checks to show for a pull request without any", () => {
    assert.equal(checks(undefined), null);
    assert.equal(checks([]), null);
  });

  it("fails on any failed check run or commit status, even while others run", () => {
    assert.equal(checks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "TIMED_OUT" }]), "fail");
    assert.equal(checks([{ status: "IN_PROGRESS" }, { state: "ERROR" }]), "fail");
  });

  it("is pending while a check run is unfinished or a commit status waits", () => {
    assert.equal(checks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "QUEUED" }]), "pending");
    assert.equal(checks([{ state: "PENDING" }]), "pending");
  });

  it("passes once every check has completed without a failure", () => {
    assert.equal(checks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "SKIPPED" }, { state: "SUCCESS" }]), "pass");
  });
});

describe("status: the agent's program", () => {
  const CLAUDE = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, agent: true };
  const SHELL = { key: "shell", name: "zsh", icon: "icons/shell.svg", tint: true, agent: false };
  // Elements that record their builder calls; `when` applies its callback.
  const element = (kind) => {
    const calls = [{ kind }];
    const proxy = new Proxy({}, { get: (_, name) => name === "calls" ? calls : (...args) => {
      if (name === "when") return args[0] ? args[1](proxy) : proxy;
      const unwrap = (x) => (Array.isArray(x) ? x.map(unwrap) : x?.calls ?? x);
      calls.push([name, ...args.map(unwrap)]);
      return proxy;
    } });
    return proxy;
  };
  const render = (f, panes, agents = [], times = {}) => {
    const evaluate = loadMods(["status/main.js"], {
      div: () => element("div"), h_flex: () => element("h_flex"),
      svg: (path) => element(`svg ${path}`), image: (path) => element(`image ${path}`),
      spaces: () => [{ id: "sp1", active: true, machine: null, branch: null }],
      agents: () => agents, panes: () => panes, focused: () => f, shared: (key) => (key === "agents.times" ? times : undefined),
      theme: () => new Proxy({}, { get: (_, name) => `#${String(name)}` }), keys: () => [], window: () => ({ platform: "linux" }),
    });
    return JSON.stringify(evaluate("Object.create(WorkspaceStatus.prototype).render()").calls);
  };

  it("puts the focused agent's program icon before This computer", () => {
    const panes = [{ terminal: "t1", tab: "tb1", program: CLAUDE }];
    const text = render({ tab: "tb1", terminal: "t1", agent: null }, panes, [{ address: "t1", program: CLAUDE }]);
    assert.match(text, /svg mods\/agent-list\/icons\/claude\.svg.*This computer/);
    assert.match(text, /"tooltip","Claude Code"/);
  });

  it("shows the focused agent's activity, session length and last update", () => {
    const panes = [{ terminal: "t1", tab: "tb1", program: CLAUDE }];
    const now = Date.now();
    const text = render({ tab: "tb1", terminal: "t1" }, panes, [{ address: "t1", program: CLAUDE }],
      { t1: { activityAt: now - 30000, startedAt: now - 16 * 60000, updatedAt: null } });
    assert.match(text, /"Active".*"<1m ago".*"Session".*"16m"/);
    assert.doesNotMatch(text, /"Updated"/);
    assert.doesNotMatch(render({ tab: "tb1", terminal: "t2" }, [{ terminal: "t2", tab: "tb1", program: SHELL }], [], { t2: { startedAt: now } }), /"Session"/);
  });

  it("shows no program for a shell or a mod pane", () => {
    assert.doesNotMatch(render({ tab: "tb1", terminal: "t2" }, [{ terminal: "t2", tab: "tb1", program: SHELL }]), /shell\.svg|agent-program/);
    assert.doesNotMatch(render({ tab: "tb1", terminal: null }, []), /agent-program/);
    assert.doesNotMatch(render(null, []), /agent-program/);
  });

  it("finds the agent an agent block shows", () => {
    const evaluate = loadMods(["status/main.js"]);
    const panes = [{ terminal: "t3", program: CLAUDE }];
    assert.equal(evaluate("focusedAgentProgram(f, panes, [])", { f: { agent: "t3", terminal: "t9" }, panes })?.name, "Claude Code");
  });
});
