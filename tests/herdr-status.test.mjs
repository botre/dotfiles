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
