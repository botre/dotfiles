import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, loadMods, plain } from "./mod-source.mjs";

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

  it("offers Reference for a tab, pointing at its agent pane", () => {
    const { evaluate } = setup([
      { tab: "tb1", terminal: "t1", focused: true },
      { tab: "tb1", terminal: "t2", program: { agent: true } },
      { tab: "tb2", terminal: "t3", program: { agent: true } },
    ]);
    const ref = plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })')).find((it) => it[0] === "Reference");
    assert.deepEqual(ref, ["Reference", "reference", { terminal: "t2" }]);
  });

  it("leaves Reference out for a tab without a terminal", () => {
    const { evaluate } = setup([]);
    assert.ok(plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })')).every((it) => it[0] !== "Reference"));
  });

  it("hands the reference to the agents list", () => {
    const { evaluate, calls, store } = setup([{ tab: "tb1", terminal: "t1" }]);
    const i = plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })')).findIndex((it) => it[0] === "Reference");
    evaluate(`Menu.prototype.choose.call({ git: null }, ${i})`);
    assert.equal(store["agent-list.action"].kind, "reference");
    assert.equal(store["agent-list.action"].address, "t1");
    assert.deepEqual(plain(calls), [["agent-list.act"]]);
  });

  it("leaves New tab out of an agent's tab menu", () => {
    const names = (panes) => plain(loadMod("menu-org", { panes: () => panes })('items({ tab: "tab", target: { id: "tb1" } })')).map((it) => it[0]);
    assert.ok(names([{ tab: "tb1", terminal: "t1" }]).includes("New tab"));
    const agent = names([{ tab: "tb1", terminal: "t1", program: { agent: true } }]);
    assert.ok(!agent.includes("New tab"));
    assert.equal(agent.at(-1), "Close");
  });

  it("offers Move to project for a tab with a terminal, opening the projects picker", () => {
    const overlays = [], closed = [], ran = [], store = {};
    const projects = [{ id: "github.com/o/one", name: "One" }, { id: "github.com/o/gone", name: "Gone", deleted: true }];
    const evaluate = loadMod("menu-org", {
      panes: () => [{ tab: "tb1", terminal: "t1" }],
      props: () => ({ tab: "tab", target: { id: "tb1", space: "sp1" }, overlay: "m1" }),
      shared: (key) => (key === "projects.list" ? projects : undefined), setShared: (key, value) => { store[key] = value; },
      openOverlay: (o) => { overlays.push(o); }, closeOverlay: (id) => { closed.push(id); }, run: (...args) => { ran.push(args); },
    });
    const list = plain(evaluate('items({ tab: "tab", target: { id: "tb1" } })'));
    const i = list.findIndex((it) => it[0] === "Move to project…");
    assert.deepEqual(list[i], ["Move to project…", "project-move", { tab: "tb1" }]);
    evaluate(`Menu.prototype.choose.call({ git: null }, ${i})`);
    assert.deepEqual(closed, ["m1"]);
    // The projects sidebar opens the picker once it has read the tab's repository.
    assert.deepEqual(overlays, []);
    assert.equal(store["projects.action"].kind, "pick");
    assert.equal(store["projects.action"].tab, "tb1");
    assert.deepEqual(plain(ran), [["projects.act"]]);
    const empty = loadMod("menu-org", { panes: () => [] });
    assert.ok(plain(empty('items({ tab: "tab", target: { id: "tb1" } })')).every((it) => it[1] !== "project-move"));
  });
});
