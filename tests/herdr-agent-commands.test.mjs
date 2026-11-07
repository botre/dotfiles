import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods, memoryStorage, plain } from "./mod-source.mjs";

describe("agent-commands", () => {
  const evaluate = loadMods(["agent-commands/main.js"]);
  const parse = (screen, cols) => JSON.parse(evaluate("JSON.stringify((({ suggested, executed }) => ({ suggested, executed: [...executed] }))(screenCommands(screen, cols)))", { screen, cols }));

  it("reads suggestions from Claude's replies and joins a command wrapped across rows", () => {
    const cols = 60;
    const screen = [
      "● Email Routing refused because the old MX records are still",
      "  there. Run that first:",
      "",
      "  ! cd ~/calmdots && for id in cd3aab96 a81dc022 61f66eeb a",
      "  c4f9cd9; do pnpm exec cf dns records delete $id --force;",
      "  done",
      "",
      "  Then run enable again:",
      "",
      "  ! cd ~/calmdots && pnpm exec cf email-routing enable",
      "  - not a command, a list item",
      "  ! cd ~/calmdots && pnpm exec cf email-routing enable",
      "",
      "!  pnpm exec cf whoami",
      "  ⎿  bjorn@example.com",
      "  Run types ! <command> into Claude: prose, not a suggestion",
    ].join("\n");
    assert.deepEqual(parse(screen, cols), {
      suggested: [
        "cd ~/calmdots && for id in cd3aab96 a81dc022 61f66eeb a c4f9cd9; do pnpm exec cf dns records delete $id --force; done",
        "cd ~/calmdots && pnpm exec cf email-routing enable",
      ],
      executed: ["pnpm exec cf whoami"],
    });
  });

  it("leaves out what ran, here or typed, and what was dismissed while it stays on screen", async () => {
    let screen = "  ! echo a\n  ! echo b\n  ! echo c\n!  echo c";
    const store = {}, sent = [], resizes = [];
    const evaluate = loadMods(["agent-commands/main.js"], {
      localStorage: memoryStorage(store),
      focused: () => ({ agent: null, terminal: "t1" }),
      terminals: () => [{ address: "t1", state: "live", cols: 200, program: { key: "claude" } }],
      hc: async (args) => { if (args[0] === "read") return { code: 0, stdout: screen }; sent.push(args); return { code: 0 }; },
      run: (name, args) => resizes.push(args.px), props: () => ({}), notify() {},
    });
    const view = evaluate("new Commands()");
    Object.assign(view, { ran: new Set(), dismissed: new Set(), height: 0 });
    const cx = { notify() {} };
    await view.load(cx);
    assert.deepEqual(plain(view.commands), ["echo a", "echo b"], "echo c was typed already");
    await view.send("echo a", cx);
    assert.deepEqual(plain(sent.at(-1)), ["send", "t1", "! echo a"]);
    view.dismiss("echo b", cx);
    await view.load(cx);
    assert.deepEqual(plain(view.commands), []);
    assert.equal(resizes.at(-1), 0);
    screen = "  ! echo z";
    await view.load(cx);
    screen = "  ! echo a\n  ! echo b";
    await view.load(cx);
    assert.deepEqual(plain(view.commands), ["echo b"], "a dismissal ends once its line leaves the screen; a run one stays gone");
  });
});
