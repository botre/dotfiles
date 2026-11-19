import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

const MODS = ["agent-list", "agent-tabs", "agent-pane", "projects", "new-menu-org", "status"];
const file = (path) => new URL(`../.config/herdr-app/mods/${path}`, import.meta.url);

describe("program icons", () => {
  it("gives every mod that draws program icons the same generated lookup", () => {
    const first = readFileSync(file("agent-list/program-icons.js"), "utf8");
    for (const mod of MODS) assert.equal(readFileSync(file(`${mod}/program-icons.js`), "utf8"), first, mod);
  });

  it("draws Claude Code and Codex as tinted marks and others from the cropped copies", () => {
    const evaluate = loadMods(["agent-list/program-icons.js"]);
    const pic = (p) => JSON.parse(JSON.stringify(evaluate(`programIcon(${JSON.stringify(p)})`)));
    assert.deepEqual(pic({ key: "claude", icon: "icons/claude.svg", tint: false }), { path: "mods/agent-list/icons/claude.svg", tint: true, color: "#D97757" });
    assert.equal(pic({ key: "pi", icon: "icons/pi.svg", tint: true }).path, "mods/agent-list/icons/programs/pi.svg");
    assert.equal(pic({ key: "new", icon: "icons/not-cropped-yet.svg", tint: false }).path, "icons/not-cropped-yet.svg");
    assert.equal(evaluate("programIcon(null)"), null);
  });

  it("has a cropped file for every name in the lookup", () => {
    const names = JSON.parse(readFileSync(file("agent-list/program-icons.js"), "utf8").match(/new Set\((\[.*\])\)/)[1]);
    for (const name of names) assert.ok(existsSync(file(`agent-list/icons/programs/${name}.svg`)), name);
  });
});
