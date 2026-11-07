import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

describe("terminal-palette", () => {
  it("publishes palette changes locally and remotely, and retries failed writes", async () => {
    let colors = { foreground: "#1b1b1e", terminal_foreground: "#4c4f69", background: "#eff1f5" }, offline = true;
    const writes = [];
    const evaluate = loadMods(["terminal-palette/main.js"], {
      theme: () => colors,
      terminals: () => [{ state: "live", address: "remote/t1" }],
      exec: async (_program, args, options) => {
        writes.push({ on: options.on, colors: JSON.parse(args.at(-1)) });
        return { code: options.on && offline ? 1 : 0 };
      },
    });
    evaluate("const palette = new TerminalPalette(); palette.published = new Map();");
    const sync = () => evaluate("palette.sync()");
    await sync();
    assert.deepEqual(writes.map((write) => write.on), [null, "remote"]);
    assert.equal(writes[0].colors.foreground, "#4c4f69");
    offline = false;
    await sync();
    assert.equal(writes.at(-1).on, "remote");
    await sync();
    assert.equal(writes.length, 3);
    colors = { foreground: "#ffffff", background: "#282c34" };
    await sync();
    assert.equal(writes.length, 5);
    assert.ok(writes.slice(-2).every((write) => write.colors.background === colors.background));
  });
});
