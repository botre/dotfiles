import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

describe("tab-actions cleanup", () => {
  const shell = { shell: true, agent: false }, app = { shell: false, agent: false }, agent = { shell: false, agent: true };
  const load = (panes, terminals = [], hc = async () => ({ code: 1 })) =>
    loadMods(["tab-actions/cleanup.js"], { panes: () => panes, terminals: () => terminals, hc });
  const ids = async (evaluate, space, busy = []) =>
    [...(await evaluate("idleTabs(space, check)", { space, check: async address => !busy.includes(address) })).map(tab => tab.id)];
  const tab = (id, extra = {}) => ({ id, status: null, active: false, ...extra });

  it("finds tabs whose every pane is a shell at its prompt", async () => {
    const space = { tabs: [tab("shell"), tab("split"), tab("app"), tab("agent", { status: "idle" }), tab("mod"), tab("mixed"), tab("empty")] };
    const panes = [
      { tab: "shell", terminal: "t1", program: shell, status: null },
      { tab: "split", terminal: "t2", program: shell, status: null },
      { tab: "split", terminal: "t3", program: shell, status: null },
      { tab: "app", terminal: "t4", program: app, status: null },
      { tab: "agent", terminal: "t5", program: agent, status: "idle" },
      { tab: "mod", terminal: null, mod: "agent-list" },
      { tab: "mixed", terminal: "t6", program: shell, status: null },
      { tab: "mixed", terminal: "t7", program: app, status: null },
    ];
    assert.deepEqual(await ids(load(panes), space), ["shell", "split"]);
  });

  it("keeps a shell running a script that reports itself as a shell", async () => {
    const space = { tabs: [tab("sql"), tab("split"), tab("idle")] };
    const panes = [
      { tab: "sql", terminal: "t1", program: shell },
      { tab: "split", terminal: "t2", program: shell },
      { tab: "split", terminal: "t3", program: shell },
      { tab: "idle", terminal: "t4", program: shell },
    ];
    assert.deepEqual(await ids(load(panes), space, ["t1", "t3"]), ["idle"]);
  });

  it("counts a shell as at its prompt only when it is its own foreground process", async () => {
    const records = {
      t1: { state: "live", pid: 10, foreground: { pid: 10, name: "zsh" } },
      t2: { state: "live", pid: 20, foreground: { pid: 21, name: "bash" } },
      t3: { state: "exited", pid: 30, foreground: { pid: 30 } },
      t4: { state: "live", pid: 40 },
    };
    const evaluate = load([], [], async ([, address]) => records[address] ? { code: 0, stdout: JSON.stringify(records[address]) } : { code: 1, stdout: "" });
    for (const [address, expected] of [["t1", true], ["t2", false], ["t3", false], ["t4", false], ["t9", false]])
      assert.equal(await evaluate(`atPrompt("${address}")`), expected, address);
    assert.equal(await load([], [], async () => { throw new Error("unreachable"); })('atPrompt("t1")'), false);
    assert.equal(await load([], [], async () => ({ code: 0, stdout: "not json" }))('atPrompt("t1")'), false);
  });

  it("keeps a shell tab whose terminal started a live sub-agent", async () => {
    const space = { tabs: [tab("a"), tab("b")] };
    const panes = [{ tab: "a", terminal: "t1", program: shell }, { tab: "b", terminal: "t2", program: shell }];
    assert.deepEqual(await ids(load(panes, [{ address: "t9", parent: "t1", state: "live" }, { address: "t8", parent: "t2", state: "exited" }]), space), ["b"]);
  });

  it("keeps the shown tab when every tab is idle, so the space stays open", async () => {
    const space = { tabs: [tab("a"), tab("b", { active: true })] };
    const panes = [{ tab: "a", terminal: "t1", program: shell }, { tab: "b", terminal: "t2", program: shell }];
    assert.deepEqual(await ids(load(panes), space), ["a"]);
  });
});
