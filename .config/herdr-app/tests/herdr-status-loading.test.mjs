import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

function harness() {
  const requests = [];
  const tasks = [];
  const evaluate = loadMods(["status/main.js"], {
    focused: () => null,
    panes: () => [],
    exec: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  });
  const status = evaluate("Object.create(WorkspaceStatus.prototype)");
  const cx = { notify() {}, spawn: (task) => tasks.push(task(cx)) };
  const load = (branch) => status.load(cx, { id: "sp1", folder: "/repo", machine: null, branch });
  const reply = (index, value) => requests[index].resolve({ code: 0, stdout: JSON.stringify(value) });
  return { status, load, reply, requests, tasks };
}

describe("WorkspaceStatus", () => {
  describe("#load", () => {
    it("should discard a response for a branch that is no longer shown", async () => {
      const h = harness();
      h.load("first");
      h.load("second");
      h.reply(1, { number: 2, statusCheckRollup: [{ state: "PENDING" }] });
      await h.tasks[1];
      h.reply(0, { number: 1, statusCheckRollup: [{ state: "SUCCESS" }] });
      await h.tasks[0];
      assert.equal(h.status.pr.number, 2);
      assert.equal(h.status.pr.checks, "pending");
    });

    it("should clear the previous pull request when GitHub is unavailable", async () => {
      const h = harness();
      h.load("first");
      h.reply(0, { number: 1 });
      await h.tasks[0];
      h.load("second");
      h.requests[1].reject(new Error("GitHub is unavailable"));
      await h.tasks[1];
      assert.equal(h.status.pr, null);
    });

    it("should discard an outstanding response after the branch disappears", async () => {
      const h = harness();
      h.load("first");
      h.load(null);
      h.reply(0, { number: 1 });
      await h.tasks[0];
      assert.equal(h.status.pr, null);
    });
  });
});
