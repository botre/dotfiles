import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../.config/herdr-app/mods/agent-list/model.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");
const context = vm.createContext({});
vm.runInContext(source, context);
const evaluate = (expression) => vm.runInContext(expression, context);
const terminal = {
  address: "vps/t7", state: "live", created_ms: 1000,
  foreground: { pid: 42, argv: ["codex"] },
  program: { agent: true }, title: "✦ Fix login | api", status: "working",
  labels: { "summary.goal": "Fix login", "summary.activity": "Trace cookies", "summary.updated": "100" },
};
const observe = (t, previous, now = 200000, start = 10000) => evaluate(`observe(${JSON.stringify(t)}, ${JSON.stringify(previous) ?? "undefined"}, ${now}, ${start})`);

describe("Herdr session timing", () => {
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
    assert.equal(rows[0].activityAt, undefined);
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
