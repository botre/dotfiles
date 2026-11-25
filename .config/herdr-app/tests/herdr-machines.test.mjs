import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, plain } from "./mod-source.mjs";

const evaluate = loadMods(["machines/model.js"]);
const run = (expression, values) => plain(evaluate(`(${expression})`, values));

describe("machines", () => {
  it("lists this computer first, then each machine by name with its status", () => {
    const layouts = [{ name: null, layout: "ready" }, { name: "vps", layout: "ready" }, { name: "mini", layout: "unavailable" }];
    const added = [
      { name: "vps", target: "me@vps", state: "connected" },
      { name: "mini", target: "me@mini", state: "needs_login" },
      { name: "box", target: "box", state: "connected" },
    ];
    assert.deepEqual(run("machineRows(layouts, added).map((m) => [m.label, m.status])", { layouts, added }), [
      ["This computer", "ready"], ["box", "unreachable"], ["mini", "login"], ["vps", "ready"],
    ]);
    assert.equal(evaluate('machineStatus("loading", "connected")'), "connecting");
  });

  it("offers Log in only when a machine asks for it, and no menu for this computer", () => {
    const ids = (row) => run("machineMenu(row).map((it) => it.divider ? \"-\" : it.id)", { row });
    assert.deepEqual(ids({ name: null, status: "ready" }), []);
    assert.deepEqual(ids({ name: "mini", status: "login" }), ["login", "update", "-", "rename", "forget"]);
    assert.deepEqual(ids({ name: "vps", status: "ready" }), ["update", "-", "rename", "forget"]);
    assert.equal(evaluate('machineMenu({ name: "mini", status: "login" }).find((it) => it.id === "update").enabled'), false);
  });

  it("sizes the footer for its rows and the popup for its items", () => {
    // 2 machines and Add machine, a divider, Settings: 4 rows of 28, 4 gaps, the heading, padding and the border.
    assert.equal(evaluate("footerHeight(2)"), 1 + 4 + 8 + 4 * 28 + 9 + 4 + 26);
    assert.equal(evaluate("footerHeight(2, true)"), 1 + 4 + 8 + 4 * 28 + 9 + 4);
    assert.equal(evaluate('menuHeight([{ id: "a" }, { divider: true }, { id: "b" }])'), 10 + 31 + 9 + 31 + 4);
  });
});
