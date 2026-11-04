import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

function fixture() {
  const files = {
    "/app/mods/summary/mod.json": JSON.stringify({ title: "Summary", agent_context: "context.md" }),
    "/app/mods/summary/context.md": "Publish a brief summary.",
    "/app/mods/unplaced/mod.json": JSON.stringify({ agent_context: "context.md" }),
    "/app/mods/unplaced/context.md": "Do not load this.",
  };
  const state = { "mods.off": [] }, writes = [];
  const terminal = { address: "remote/t7", state: "live", program: { agent: true }, labels: {} };
  const context = vm.createContext({
    View: class {},
    layout: () => ({ children: [{ content: { mod: "summary" } }] }),
    panes: () => [], terminals: () => [terminal],
    shared: (key) => state[key], setShared: (key, value) => { state[key] = value; },
    appHome: () => "/app", readTextFile: async (path) => files[path] ?? null,
    hc: async (args) => { writes.push(args); terminal.labels["herdr.context"] = args[2].slice("herdr.context=".length); return { code: 0 }; },
  });
  const source = readFileSync(new URL("../.config/herdr-app/mods/agent-context/main.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "").replace("export default class", "class");
  vm.runInContext(source, context);
  const mod = vm.runInContext("new AgentContext()", context);
  return { files, state, writes, sync: () => mod.sync({ notify() {} }) };
}

describe("Herdr plugin context", () => {
  it("publishes enabled providers to remote terminals and clears disabled instructions", async () => {
    const f = fixture();
    await f.sync();
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0][1], "remote/t7");
    assert.match(f.writes[0][2], /Publish a brief summary/);
    assert.doesNotMatch(f.writes[0][2], /Do not load this/);
    await f.sync();
    assert.equal(f.writes.length, 1);
    f.state["mods.off"] = ["summary"];
    await f.sync();
    assert.equal(f.writes[1][2], "herdr.context=");
  });

  it("rejects context paths outside a mod and retains the last valid publication", async () => {
    const f = fixture();
    await f.sync();
    f.files["/app/mods/summary/mod.json"] = JSON.stringify({ agent_context: "../../private.md" });
    await f.sync();
    assert.equal(f.writes.length, 1);
    assert.match(f.state["agent-context.error"], /Invalid context file/);
  });

  it("clears all contributed instructions when the context provider itself is disabled", async () => {
    const f = fixture();
    await f.sync();
    f.state["mods.off"] = ["agent-context"];
    await f.sync();
    assert.equal(f.writes[1][2], "herdr.context=");
  });
});
