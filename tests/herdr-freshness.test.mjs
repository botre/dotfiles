import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

const now = 2000000;
const terminal = { address: "t1", foreground: { pid: 42 }, program: { key: "codex" }, labels: {} };
const report = { activity: "Prepare worktree", updatedAt: now - 600000, activityAt: now - 700000 };
const observed = { pid: 42, session: "session", stamp: "100:200", conversationAt: now - 10000, checkedAt: now };
const evaluate = loadMods(["agent-list/model.js"]);
const call = (name, ...args) => evaluate(`${name}(${args.map((value) => JSON.stringify(value)).join(",")})`);
const state = (t = terminal, r = report, o = observed) => call("activityState", t, r, o, now);
const needed = (t = terminal, r = report, o = observed) => call("needsRecap", t, r, o, now);

describe("Herdr conversation freshness", () => {
  it("prefers a newer status report over an older explicit summary", () => {
    const value = state({ ...terminal, report: { msg: "Wait for CI" }, status_ms: now - 1000 });
    assert.equal(value.activity, "Wait for CI");
    assert.equal(value.source, "status");
    assert.equal(value.freshness, "current");
    assert.equal(value.activityAt, null);
  });
  it("retains a newer explicit report and its activity clock", () => {
    const value = state({ ...terminal, report: { msg: "Older report" }, status_ms: now - 900000 }, { ...report, updatedAt: now });
    assert.equal(value.activity, report.activity);
    assert.equal(value.activityAt, report.activityAt);
  });
  it("marks old text as last reported when the conversation advances", () => {
    assert.equal(state().freshness, "outdated");
    assert.equal(state().activityAt, null);
    assert.equal(needed(), true);
  });
  it("does not equate old age with stale content when the conversation is unchanged", () => {
    const observation = { ...observed, conversationAt: report.updatedAt };
    assert.equal(state(terminal, report, observation).freshness, "current");
    assert.equal(needed(terminal, report, observation), false);
  });
  it("reports freshness as unknown after an inspection fails or ages out", () => {
    for (const observation of [null, { ...observed, error: "Unavailable" }, { ...observed, checkedAt: now - 90000 }]) {
      assert.equal(state(terminal, report, observation).freshness, "unknown");
      assert.equal(needed(terminal, report, observation), false);
    }
  });
  it("orders recaps by conversation coverage rather than generation time", () => {
    const observation = { ...observed, recap: { activity: "Old recap", at: now, conversationAt: now - 900000, stamp: "older" } };
    assert.equal(state(terminal, report, observation).source, "agent");
  });
  it("requires an unchanged transcript stamp for a current recap and never invents a timer", () => {
    const recap = { activity: "Verify tests", at: now, conversationAt: observed.conversationAt, stamp: observed.stamp };
    const value = state(terminal, report, { ...observed, recap });
    assert.equal(value.freshness, "current");
    assert.equal(value.activityAt, null);
    assert.equal(state(terminal, report, { ...observed, recap: { ...recap, stamp: "changed" } }).freshness, "outdated");
  });
  it("waits for quiet reports and suppresses pending or recently generated recaps", () => {
    assert.equal(needed(terminal, { ...report, updatedAt: now - 60000 }), false);
    for (const recap of [{ pendingAt: now - 60000 }, { at: now - 60000 }, { error: "Timed out", at: now - 60000 }]) {
      assert.equal(needed(terminal, report, { ...observed, recap }), false);
    }
    assert.equal(needed(terminal, {}, observed), true);
  });
  it("rejects a report from a previous foreground process", () => {
    assert.equal(state(terminal, { ...report, pid: 99 }).source, null);
  });
});

function harness({ shown = true, enabled = true, all = [terminal], probe, fail = false } = {}) {
  let clock = now;
  const values = { "agents.recaps.enabled": enabled }, commands = [], probes = [];
  const evaluate = loadMods(["agent-list/model.js", "agent-list/conversations.js"], {
    Date: { now: () => clock }, appHome: () => "/home/test/.config/herdr-app",
    readTextFile: async () => "python backend", shared: (key) => values[key], setShared: (key, value) => { values[key] = value; },
    terminals: () => all, spaces: () => [{ active: true, tabs: [{ active: true, id: "overview" }] }],
    panes: () => shown ? [{ tab: "overview", mod: "agent-list" }] : [],
    hc: async (args) => { commands.push(args); return { code: 0 }; },
    exec: async (_program, args, options) => {
      probes.push(options);
      if (fail) throw new Error("Offline");
      const requests = JSON.parse(args.at(-1));
      const result = requests.map((request) => ({ ...observed, ...request, ...(probe || {}) }));
      return { code: 0, stdout: JSON.stringify(result) };
    },
  });
  evaluate("const watcher = new Conversations();");
  return { values, commands, probes, advance: (ms) => { clock += ms; },
    sync: (records = {}) => evaluate("watcher.sync(input, records)", { input: all, records }) };
}

describe("Herdr recap scheduling", () => {
  it("inspects transcripts without model calls when recaps are disabled or the overview is closed", async () => {
    for (const options of [{ shown: false }, { enabled: false }, { enabled: undefined }]) {
      const h = harness(options);
      if (options.enabled === undefined && options.shown === undefined) delete h.values["agents.recaps.enabled"];
      await h.sync();
      assert.equal(h.probes.length, 1);
      assert.equal(h.commands.filter((args) => args[0] === "run").length, 0);
    }
  });
  it("does not recap current reports or unavailable transcripts", async () => {
    for (const options of [{}, { fail: true }, { probe: { error: "Unknown session" } }]) {
      const h = harness(options);
      await h.sync({ t1: { ...report, updatedAt: now } });
      assert.equal(h.commands.filter((args) => args[0] === "run").length, 0);
    }
  });
  it("routes remote inspections and one bounded background recap to the right machine", async () => {
    const h = harness({ all: [{ ...terminal, address: "vps/t1" }] });
    await h.sync();
    assert.equal(h.probes[0].on, "vps");
    const run = h.commands.find((args) => args[0] === "run");
    assert.equal(run[run.indexOf("--on") + 1], "vps");
    assert.ok(run.includes("--no-parent"));
    assert.ok(run.includes("--rm"));
    assert.equal(JSON.parse(run.at(-1)).session, "session");
    h.advance(30000);
    await h.sync();
    assert.equal(h.commands.filter((args) => args[0] === "run").length, 1);
  });
  it("discards observations returned for a replaced foreground process", async () => {
    const h = harness({ probe: { pid: 99 } });
    await h.sync();
    assert.equal(h.values["agents.conversations"].t1, undefined);
    assert.equal(h.commands.length, 0);
  });
  it("does not launch independent recaps for hidden helpers", async () => {
    const h = harness({ all: [{ ...terminal, parent: "t0" }] });
    await h.sync();
    assert.equal(h.commands.filter((args) => args[0] === "run").length, 0);
  });
});
