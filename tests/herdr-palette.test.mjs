import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import vm from "node:vm";

it("publishes palette changes locally and remotely, and retries failed writes", async () => {
  let colors = { foreground: "#1b1b1e", terminal_foreground: "#4c4f69", background: "#eff1f5" }, offline = true;
  const writes = [];
  const context = vm.createContext({
    View: class {}, theme: () => colors,
    terminals: () => [{ state: "live", address: "remote/t1" }],
    exec: async (_program, args, options) => {
      writes.push({ on: options.on, colors: JSON.parse(args.at(-1)) });
      return { code: options.on && offline ? 1 : 0 };
    },
  });
  const source = readFileSync(new URL("../.config/herdr-app/mods/terminal-palette/main.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "").replace("export default class", "class");
  vm.runInContext(source + "\nconst palette = new TerminalPalette(); palette.published = new Map();", context);
  const sync = () => vm.runInContext("palette.sync()", context);
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
