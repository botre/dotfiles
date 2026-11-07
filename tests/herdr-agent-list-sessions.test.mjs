import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const evaluate = loadMods(["agent-list/model.js"]);
const terminal = {
  address: "vps/t7", state: "live", created_ms: 1000,
  foreground: { pid: 42, argv: ["codex"] },
  program: { agent: true }, title: "✦ Fix login | api", status: "working",
  labels: { "summary.goal": "Fix login", "summary.activity": "Trace cookies", "summary.updated": "100" },
};
const observe = (t, previous, now = 200000, start = 10000) => evaluate(`observe(${JSON.stringify(t)}, ${JSON.stringify(previous) ?? "undefined"}, ${now}, ${start})`);

describe("agent-list session timing", () => {
  it("keeps activity age on refresh and resets it only for a different activity", () => {
    const first = observe(terminal);
    const refresh = observe({ ...terminal, labels: { ...terminal.labels, "summary.updated": "110" } }, first);
    assert.equal(refresh.activityAt, 100000);
    assert.equal(refresh.updatedAt, 110000);
    const next = observe({ ...terminal, labels: { ...terminal.labels, "summary.activity": "Test fix", "summary.updated": "120" } }, refresh);
    assert.equal(next.activityAt, 120000);
  });

  it("discards old summaries after resume and accepts the new process's update", () => {
    const previous = observe(terminal);
    const resumed = { ...terminal, foreground: { pid: 43, argv: ["codex"] } };
    const stale = observe(resumed, previous, 200000, 150000);
    assert.equal(stale.activityAt, null);
    assert.equal(stale.goal, "");
    const fresh = observe({ ...resumed, labels: { ...resumed.labels, "summary.updated": "160" } }, stale, 200000, 150000);
    assert.equal(fresh.activityAt, 160000);
    assert.equal(fresh.startedAt, 150000);
  });

  it("does not infer activity duration from a status change or malformed update", () => {
    for (const timestamp of ["", "oops", "999999999999"]) {
      const record = observe({ ...terminal, status_ms: 10000, labels: { ...terminal.labels, "summary.updated": timestamp } });
      assert.equal(record.activityAt, null);
      assert.equal(record.updatedAt, null);
    }
  });

  it("rejects old summary labels after resume even when process age is unavailable", () => {
    const previous = observe(terminal);
    const resumed = { ...terminal, foreground: { pid: 43, argv: ["codex"] } };
    const first = observe(resumed, previous, 200000, null);
    assert.equal(first.activityAt, null);
    const next = observe(resumed, first, 210000, null);
    assert.equal(next.activityAt, null);
    const fresh = observe({ ...resumed, labels: { ...resumed.labels, "summary.updated": "220" } }, next, 220000, null);
    assert.equal(fresh.activityAt, 220000);
  });

  it("parses Linux and macOS process age, including overnight sessions", () => {
    for (const [value, milliseconds] of [["00:45", 45000], ["01:02:03", 3723000], ["1-02:03:04", 93784000]]) {
      assert.equal(evaluate(`parseElapsed(${JSON.stringify(value)})`), milliseconds);
    }
    assert.equal(evaluate('parseElapsed("unknown")'), null);
  });

  it("includes remote and unshown agents while excluding ordinary shell terminals", () => {
    const all = [terminal, { ...terminal, address: "t1", program: { agent: false }, foreground: { pid: 1, argv: ["zsh"] } }];
    const spaces = [{ id: "vps/sp1", name: "API", tabs: [{ id: "vps/tb1", name: "Login" }] }];
    all[0].labels = { ...all[0].labels, "herdr.space": "sp1", "herdr.tab": "tb1" };
    const rows = evaluate(`sessionRows(${JSON.stringify(all)}, [], ${JSON.stringify(spaces)}, {})`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].machine, "vps");
    assert.equal(rows[0].space, "API");
    assert.equal(rows[0].name, "Login");
    assert.equal(rows[0].activityAt, null);
  });

  it("uses each session's directory and branch without borrowing another repository's space branch", () => {
    const spaces = [{ id: "vps/sp1", name: "Work", branch: "wrong-repo", tabs: [] }];
    const all = [{ ...terminal, labels: { "herdr.space": "sp1" }, foreground: { cwd: "/srv/api" } }];
    const panes = [{ terminal: "vps/t7", cwd: "/srv/api", branch: "fix/login" }];
    const row = evaluate(`sessionRows(${JSON.stringify(all)}, [], ${JSON.stringify(spaces)}, {}, ${JSON.stringify(panes)})[0]`);
    assert.equal(row.cwd, "/srv/api");
    assert.equal(row.branch, "fix/login");
    assert.equal(evaluate(`sessionRows(${JSON.stringify(all)}, [], ${JSON.stringify(spaces)}, {})[0].branch`), null);
    assert.equal(evaluate('directoryName("/srv/api/")'), "api");
  });
});

describe("agent-list session groups", () => {
  const group = (rows, terminals = rows) => plain(evaluate(`groupSessions(${JSON.stringify(rows)}, ${JSON.stringify(terminals)})`));

  it("collapses live helpers under their primary session, including completed turns", () => {
    const rows = [
      { address: "t1", pane: "p1" },
      { address: "t2", parent: "t1", status: "done" },
      { address: "t3", parent: "t1", status: "working" },
    ];
    const groups = group(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].helpers, 2);
    assert.deepEqual(groups[0].children.map((row) => row.address), ["t2", "t3"]);
  });

  it("keeps promoted helpers as primary sessions with their own descendants", () => {
    const groups = group([
      { address: "t1", pane: "p1" },
      { address: "t2", parent: "t1", pane: "p2" },
      { address: "t3", parent: "t2" },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].helpers, 0);
    assert.equal(groups[1].helpers, 1);
    assert.equal(groups[1].children[0].address, "t3");
  });

  it("finds the parent session through a non-agent terminal", () => {
    const rows = [{ address: "t1", tab: "tab1" }, { address: "t3", parent: "t2" }];
    const groups = group(rows, [...rows, { address: "t2", parent: "t1" }]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].children[0].address, "t3");
  });

  it("qualifies remote parents without grouping them under a local terminal with the same ID", () => {
    const groups = group([
      { address: "t1", pane: "p1" },
      { address: "remote/t1", pane: "remote/p1" },
      { address: "remote/t2", parent: "t1" },
    ]);
    assert.equal(groups[0].helpers, 0);
    assert.equal(groups[1].children[0].address, "remote/t2");
  });

  it("counts nested helpers while retaining their hierarchy", () => {
    const groups = group([
      { address: "t1", pane: "p1" },
      { address: "t2", parent: "t1" },
      { address: "t3", parent: "t2" },
    ]);
    assert.equal(groups[0].helpers, 2);
    assert.equal(groups[0].children[0].helpers, 1);
    assert.equal(groups[0].children[0].children[0].address, "t3");
  });

  it("keeps orphaned agents visible and handles malformed ancestry without cycles", () => {
    const groups = group([
      { address: "t1", parent: "missing" },
      { address: "t2", parent: "t3" },
      { address: "t3", parent: "t2" },
    ]);
    assert.equal(groups.length, 3);
    assert.ok(groups.every((row) => row.helpers === 0));
  });
});

describe("agent-list helper names", () => {
  const helper = { address: "t2qg", name: "cx675", foreground: { pid: 42 }, labels: {} };
  const name = (t) => evaluate(`helperName(${JSON.stringify(t)})`);

  it("prefers the published title, then the goal, then the terminal name", () => {
    assert.equal(name({ ...helper, labels: { "session.title": "Script 675 probes", "session.title.pid": "42", "summary.goal": "Explore", "summary.pid": "42" } }), "Script 675 probes");
    assert.equal(name({ ...helper, labels: { "summary.goal": "Explore native scripts", "summary.pid": "42" } }), "Explore native scripts");
    assert.equal(name(helper), "cx675");
  });

  it("ignores labels an earlier program in the terminal wrote", () => {
    assert.equal(name({ ...helper, labels: { "session.title": "Old work", "session.title.pid": "7" } }), "cx675");
  });
});
