import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

const now = 2000000;
const terminal = { address: "t1", foreground: { pid: 42 }, program: { key: "codex" }, labels: {} };
const report = { activity: "Prepare worktree", updatedAt: now - 600000, activityAt: now - 700000 };
const observed = { pid: 42, session: "session", stamp: "100:200", conversationAt: now - 10000, checkedAt: now };
const titled = { ...terminal, labels: { "session.title": "Login fix" } };
const evaluate = loadMods(["agent-list/model.js"]);
const call = (name, ...args) => evaluate(`${name}(${args.map((value) => JSON.stringify(value)).join(",")})`);
const state = (t = terminal, r = report, o = observed) => call("activityState", t, r, o, now);
const needed = (t = terminal, r = report, o = observed) => call("needsRecap", t, r, o, now);

describe("agent-list conversation freshness", () => {
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
    // A session with its own goal and title needs no recap.
    assert.equal(needed(titled, { ...report, goal: "Fix login" }, observation), false);
    assert.equal(needed(terminal, report, observation), true, "a missing goal or title still asks for one");
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
  it("keeps a report current through its own turn, whatever the transcript does", () => {
    const working = { ...terminal, turn: 4, status: "working" };
    assert.equal(state(working, { ...report, reportTurn: 4 }).freshness, "current");
    assert.equal(state({ ...working, turn: 5, status: "idle" }, { ...report, reportTurn: 4 }).freshness, "current");
    assert.equal(state({ ...working, turn: 5, status: "done" }, { ...report, reportTurn: 4 }, null).freshness, "current");
    assert.equal(needed({ ...titled, turn: 5, status: "idle" }, { ...report, goal: "Fix login", reportTurn: 4 }), false);
  });
  it("marks a report outdated once a newer turn starts without one", () => {
    assert.equal(state({ ...terminal, turn: 5, status: "working" }, { ...report, reportTurn: 4 }).freshness, "outdated");
    assert.equal(state({ ...terminal, turn: 5, status: "blocked" }, { ...report, reportTurn: 4 }).freshness, "outdated");
    assert.equal(state({ ...terminal, turn: 6, status: "idle" }, { ...report, reportTurn: 4 }).freshness, "outdated");
  });
  it("remembers the turn of each new report and keeps it while the report stands", () => {
    const base = { ...terminal, created_ms: 1, turn: 3, labels: { "summary.goal": "G", "summary.activity": "A", "summary.updated": "1900" } };
    const first = JSON.parse(evaluate(`JSON.stringify(observe(${JSON.stringify(base)}, undefined, ${now}, 1000))`));
    assert.equal(first.reportTurn, 3);
    const later = JSON.parse(evaluate(`JSON.stringify(observe(${JSON.stringify({ ...base, turn: 4 })}, ${JSON.stringify(first)}, ${now}, 1000))`));
    assert.equal(later.reportTurn, 3);
    const renewed = JSON.parse(evaluate(`JSON.stringify(observe(${JSON.stringify({ ...base, turn: 4, labels: { ...base.labels, "summary.updated": "1950" } })}, ${JSON.stringify(later)}, ${now}, 1000))`));
    assert.equal(renewed.reportTurn, 4);
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

describe("agent-list recap scheduling", () => {
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

describe("agent-list live transcript activity", () => {
  const live = { action: "Running node --test", actionAt: now - 12000, message: "The tests pass.", messageAt: now - 5000, working: true };
  const watched = { ...observed, live };
  it("prefers a current agent report over live activity", () => {
    const value = state(terminal, { ...report, updatedAt: now - 5000, activityAt: now - 8000 }, { ...watched, conversationAt: now - 5000 });
    assert.equal(value.source, "agent");
    assert.equal(value.activityAt, now - 8000);
  });
  it("shows the running tool action while a turn is underway, timed from that action", () => {
    const value = state(terminal, report, watched);
    assert.equal(value.activity, "Running node --test");
    assert.equal(value.source, "live");
    assert.equal(value.freshness, "current");
    assert.equal(value.activityAt, now - 12000);
    assert.equal(call("activityMeta", value, now), "Live · 12s ago");
  });
  it("shows the latest assistant sentence once the turn ends", () => {
    const value = state(terminal, report, { ...watched, live: { ...live, working: false } });
    assert.equal(value.activity, "The tests pass.");
    assert.equal(call("activityMeta", value, now), "Latest message · 5s ago");
  });
  it("puts live activity ahead of recaps and status messages", () => {
    const recap = { activity: "Verify tests", at: now, conversationAt: observed.conversationAt, stamp: observed.stamp };
    assert.equal(state({ ...terminal, report: { msg: "Wait for CI" }, status_ms: now }, report, { ...watched, recap }).source, "live");
    assert.equal(state(terminal, report, { ...observed, recap }).source, "recap");
  });
  it("ignores live activity from a failed or aged inspection", () => {
    assert.equal(state(terminal, report, { ...watched, error: "Unavailable" }).source, "agent");
    assert.equal(state(terminal, report, { ...watched, checkedAt: now - 90000 }).source, "agent");
  });
  it("keeps meta text plain for reports, recaps and failures", () => {
    assert.equal(call("activityMeta", { source: "recap", freshness: "current" }, now), "Current · recap");
    assert.equal(call("activityMeta", { source: "agent", freshness: "outdated", updatedAt: now - 240000 }, now), "Reported · 4m ago · conversation changed");
    assert.equal(call("activityMeta", { source: null, inspectionError: "Unavailable" }, now), "Conversation unavailable");
    assert.equal(call("activityMeta", { source: null }, now), "No current report");
  });
  it("waits fifteen minutes between recaps of one session and skips an unchanged transcript", () => {
    assert.equal(needed(terminal, {}, { ...observed, recap: { at: now - 600000, goal: "Old" } }), false);
    assert.equal(needed(terminal, {}, { ...observed, recap: { at: now - 960000, goal: "Old", stamp: "older" } }), true);
    assert.equal(needed(terminal, {}, { ...observed, recap: { at: now - 960000, goal: "Same", stamp: observed.stamp } }), false);
  });
});

describe("agent-list goals and names", () => {
  const base = { address: "t1", state: "live", foreground: { pid: 42 }, program: { agent: true, key: "codex" }, labels: {}, title: "" };
  const seen = (extra = {}) => ({ ...observed, ...extra });
  const goal = (t, r = {}, o = null, tab = null) => call("goalState", t, r, o, tab);
  const name = (t, o, r) => call("sessionName", t, o, r);
  it("takes the goal from the report, then the recap and the first prompt, never the title", () => {
    const o = seen({ recap: { goal: "Recap goal" }, firstPrompt: "Please fix the login page" });
    assert.equal(goal(base, { goal: "Report goal" }, o), "Report goal");
    assert.equal(goal({ ...base, title: "✦ Login fix | api", labels: { "session.title": "Login fix" } }, {}, o), "Recap goal");
    assert.equal(goal({ ...base, title: "Claude Code" }, {}, o), "Recap goal");
    assert.equal(goal(base, {}, seen({ firstPrompt: "Please fix the login page" })), "Please fix the login page");
    assert.equal(goal(base, {}, { ...o, pid: 7 }), "No goal update yet");
  });
  it("names sessions by /rename, then the published title, the recap title and the goal", () => {
    const labels = { "session.title": "Published", "summary.goal": "Agent goal" };
    assert.equal(name({ ...base, labels }, seen({ renamed: "Renamed", recap: { title: "Recap title" } })), "Renamed");
    assert.equal(name({ ...base, labels }, seen({ recap: { title: "Recap title" } })), "Published");
    assert.equal(name({ ...base, labels: { "summary.goal": "Agent goal" } }, seen({ recap: { title: "Recap title" } })), "Recap title");
    assert.equal(name({ ...base, labels: { "summary.goal": "Agent goal" } }, null), "Agent goal");
    assert.equal(call("helperName", { ...base, name: "cx675" }, seen({ recap: { title: "Recap title" } })), "Recap title");
    assert.equal(call("helperName", { ...base, name: "cx675" }, seen({ pid: 7, recap: { title: "Old process" } })), "cx675");
  });
  it("asks a recap for a title only without a /rename name or published title", () => {
    assert.equal(call("recapWantsTitle", base, observed), true);
    assert.equal(call("recapWantsTitle", { ...base, labels: { "session.title": "Mine" } }, observed), false);
    assert.equal(call("recapWantsTitle", base, seen({ renamed: "Renamed" })), false);
  });
  it("passes the title request to the background recap", async () => {
    const titledRun = harness({ all: [{ ...terminal, labels: { "session.title": "Mine" } }] });
    await titledRun.sync();
    assert.equal(JSON.parse(titledRun.commands.find((args) => args[0] === "run").at(-1)).wantTitle, false);
    const untitled = harness();
    await untitled.sync();
    assert.equal(JSON.parse(untitled.commands.find((args) => args[0] === "run").at(-1)).wantTitle, true);
  });
});
