import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, plain } from "./mod-source.mjs";

describe("menu-org", () => {
  const setup = (paneList) => {
    const calls = [], store = {};
    const evaluate = loadMod("menu-org", {
      panes: () => paneList,
      props: () => ({ tab: "tab", target: { id: "tb1", space: "sp1" } }),
      closeOverlay: () => {},
      setShared: (key, value) => { store[key] = value; },
      run: (...args) => calls.push(args),
    });
    return { evaluate, calls, store };
  };

  it("offers Reference this for a tab, pointing at its agent pane", () => {
    const { evaluate } = setup([
      { tab: "tb1", terminal: "t1", focused: true },
      { tab: "tb1", terminal: "t2", program: { agent: true } },
      { tab: "tb2", terminal: "t3", program: { agent: true } },
    ]);
    const ref = plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })')).find((it) => it[0] === "Reference this");
    assert.deepEqual(ref, ["Reference this", "reference", { terminal: "t2" }]);
  });

  it("leaves Reference this out for a tab without a terminal", () => {
    const { evaluate } = setup([]);
    assert.ok(plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })')).every((it) => it[0] !== "Reference this"));
  });

  it("hands the reference to the agents list", () => {
    const { evaluate, calls, store } = setup([{ tab: "tb1", terminal: "t1" }]);
    const i = plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })')).findIndex((it) => it[0] === "Reference this");
    evaluate(`Menu.prototype.choose.call({ git: null }, ${i})`);
    assert.equal(store["agent-list.action"].kind, "reference");
    assert.equal(store["agent-list.action"].address, "t1");
    assert.deepEqual(plain(calls), [["agent-list.act"]]);
  });
});
