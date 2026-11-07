import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

describe("agent-tabs", () => {
  const evaluate = loadMods(["agent-tabs/main.js"]);
  const ids = (expression, values) => JSON.parse(evaluate(`JSON.stringify(${expression}.map((t) => t.id))`, values));
  const tab = (id, active = false) => ({ id, active });
  const agentPane = (tabId, terminal) => ({ tab: tabId, terminal, program: { agent: true } });

  it("hides a tab only when every agent in it is snoozed, and never the tab in view", () => {
    const space = { tabs: [tab("a"), tab("b"), tab("c"), tab("d", true), tab("e"), tab("f"), tab("g")] };
    const all = [
      agentPane("a", "t1"),
      agentPane("b", "t2"), agentPane("b", "t3"),
      { tab: "c", terminal: "t4", program: { shell: true } },
      agentPane("d", "t5"),
      agentPane("e", "t6"),
      agentPane("f", "t7"),
      { tab: "g", terminal: "t8", program: { agent: false }, status: null },
      { tab: "g", terminal: "t9", program: { shell: true }, status: null },
    ];
    const terms = new Map([
      ["t1", { labels: { "inbox.snoozed": "5000" } }],
      ["t2", { labels: { "inbox.snoozed": "5000" } }],
      ["t4", { labels: { "inbox.snoozed": "5000" } }],
      ["t5", { labels: { "inbox.snoozed": "5000" } }],
      ["t6", { labels: { "inbox.snoozed": "500" } }],
      ["t8", { labels: { "inbox.snoozed": "5000" } }],
    ]);
    const pending = { t7: { "inbox.snoozed": "5000", at: 900 } };
    assert.deepEqual(ids("visibleTabs(space, all, terms, pending, 1000)", { space, all, terms, pending }), ["b", "d", "e"]);
    assert.deepEqual(ids("visibleTabs(space, all, terms, pending, 9000)", { space, all, terms, pending }), ["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("hides a tab whose agents are all settled, until one works, needs you or starts a new turn", () => {
    const space = { tabs: [tab("a"), tab("b"), tab("c"), tab("d"), tab("e"), tab("f", true)] };
    const all = [
      agentPane("a", "t1"),
      agentPane("b", "t2"), agentPane("b", "t3"),
      { ...agentPane("c", "t4"), status: "working" },
      agentPane("d", "t5"),
      agentPane("e", "t6"),
      agentPane("f", "t7"),
    ];
    const settled = (turn, at = 100) => ({ labels: { "inbox.settled": `${at}:${turn}` } });
    const terms = new Map([
      ["t1", { ...settled(3), turn: 3 }],
      ["t2", { labels: { "inbox.snoozed": "5000" } }], ["t3", { ...settled(1), turn: 1 }],
      ["t4", { ...settled(2), turn: 2 }],
      ["t5", { ...settled(2), turn: 3 }],
      ["t6", { labels: {}, turn: 0 }],
      ["t7", { ...settled(0), turn: 0 }],
    ]);
    const pending = { t6: { "inbox.settled": "900:0", at: 900 } };
    // a: settled; b: one snoozed, one settled; c: works again; d: a newer turn; e: just settled; f: in view.
    assert.deepEqual(ids("visibleTabs(space, all, terms, pending, 1000)", { space, all, terms, pending }), ["c", "d", "f"]);
  });

  it("numbers and steps through the tabs the bar shows", () => {
    const tabs = [tab("a"), tab("c", true), tab("e")];
    assert.equal(evaluate('tabFor("select-2", tabs).id', { tabs }), "c");
    assert.equal(evaluate('tabFor("select-4", tabs)', { tabs }), null);
    assert.equal(evaluate('tabFor("next", tabs).id', { tabs }), "e");
    assert.equal(evaluate('tabFor("prev", tabs).id', { tabs }), "a");
    assert.equal(evaluate('tabFor("next", [tabs[2], tabs[1]]).id', { tabs }), "e");
    assert.equal(evaluate('tabFor("other", tabs)', { tabs }), null);
  });
});
