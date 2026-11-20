import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, memoryStorage, plain } from "./mod-source.mjs";

describe("resume", () => {
  const evaluate = loadMod("resume");

  it("carries allowed inline flags and drops executable configuration", () => {
    assert.equal(evaluate('carry("codex", ["--model=gpt-6", "--no-daemon", "--profile=unsafe"]).join(" ")'), "--model gpt-6 --no-daemon");
  });

  it("carries every --add-dir folder and quotes it on resume", () => {
    assert.equal(evaluate('JSON.stringify(carry("claude", ["--add-dir", "/tmp/a b", "../c", "--model", "opus", "fix it"]))'), JSON.stringify(["--add-dir", "/tmp/a b", "../c", "--model", "opus"]));
    assert.equal(evaluate('JSON.stringify(carry("claude", ["--add-dir=/tmp/x"]))'), JSON.stringify(["--add-dir", "/tmp/x"]));
    for (const bad of ["/tmp/it's", "/tmp/a\nb"]) assert.equal(evaluate(`carry("claude", ["--add-dir", ${JSON.stringify(bad)}]).length`), 0);
    assert.equal(evaluate('carry("claude", ["constructor", "x"]).length'), 0);
    assert.equal(evaluate('command({agent:"claude",session:"s1",cwd:"/tmp/p",flags:["--add-dir","/tmp/a b"]})'), "cd '/tmp/p' && claude --add-dir '/tmp/a b' --resume s1");
  });

  it("tells a recovered shell from the old one by its start time when the pid repeats", async () => {
    const starts = { 7: "Fri Nov  6 09:00:00 2026" };
    const evaluate = loadMod("resume", { exec: async (_cmd, args) => ({ code: 0, stdout: `${starts[args.at(-1)] ?? ""}\n` }) });
    const rec = (since) => JSON.stringify({ shell: 7, since });
    assert.equal(await evaluate(`replaced({pid:8}, ${rec("x")})`), true);
    assert.equal(await evaluate(`replaced({pid:7}, ${rec("Fri Nov  6 09:00:00 2026")})`), false);
    assert.equal(await evaluate(`replaced({pid:7}, ${rec("Thu Nov  5 22:00:00 2026")})`), true);
    assert.equal(await evaluate('replaced({pid:7}, {shell:7})'), false);
  });

  it("stops offering a resume that gave up, and lets a later press retry it", async () => {
    const session = "12345678-1234-1234-1234-123456789abc";
    const record = (extra = {}) => JSON.stringify({ agent: "codex", session, cwd: "/tmp", shell: 1, ...extra });
    let label = record();
    const sent = [], notes = [];
    const evaluate = loadMod("resume", {
      terminals: () => [{ address: "t1", keep: true, state: "live", pid: 2, foreground: { name: "zsh", argv: ["-zsh"] }, labels: { resume: label } }],
      hc: async ([cmd, , arg]) => {
        if (cmd === "label") label = arg.slice("resume=".length);
        else sent.push(arg);
        return { code: 0, stderr: "" };
      },
      exec: async () => ({ code: 1, stdout: "" }),
      spaces: () => [],
      shared: () => [],
      setShared() {},
      localStorage: memoryStorage(),
      notify: (n) => notes.push(n),
    });
    const mod = evaluate("new Resume()");
    await mod.watch();
    assert.equal(notes.at(-1).title, "1 agent can be resumed");
    await mod.resume();
    assert.equal(sent.length, 1);
    assert.ok(Number.isFinite(JSON.parse(label).tried));
    await mod.resume();
    assert.equal(sent.length, 1, "a second press while it starts types nothing");
    notes.length = 0;
    await mod.watch();
    assert.equal(notes.length, 0, "no new nudge after it gave up");
    label = record({ tried: Date.now() - 120000 });
    await mod.resume();
    assert.equal(sent.length, 2);
  });

  it("finds a Codex session from the thread lock its process holds", async () => {
    const own = "01a1b11a-5e62-7eb3-bced-0debdfdcc0bb", helper = "01a1b11a-5eb3-7e42-8a88-dd7e0930762a";
    const evaluate = loadMod("resume", {
      exec: async (cmd, args) => {
        if (cmd === "find" && args[0] === "/proc/42/fd") return { code: 0, stdout: [own, helper, own].map((id) => `/home/test/.codex/thread-writer-locks/${id}.lock`).join("\n") };
        if (cmd === "find") return args[2].includes(own) ? { code: 0, stdout: `/home/test/.codex/sessions/r-${own}.jsonl\n` } : { code: 0, stdout: "" };
        if (cmd === "head") return { code: 0, stdout: '{"type":"session_meta","payload":{"thread_source":"user"}}' };
        return { code: 1, stdout: "" };
      },
    });
    assert.equal((await evaluate('codexSession("Same name | /tmp", async () => "", 42)')).session, own);
    assert.equal(await evaluate('codexSession("", async () => "", 43)'), null);
  });

  it("forces isolated Codex routing on resume, including records saved without the flag", () => {
    assert.equal(evaluate('command({agent:"codex",session:"session-id",cwd:"/tmp/project",flags:[]})'), "cd '/tmp/project' && \"$HOME/scripts/herdr-codex\" resume session-id");
    assert.equal(evaluate('command({agent:"codex",session:"session-id",cwd:"/tmp/project",flags:["--no-daemon"]})'), "cd '/tmp/project' && \"$HOME/scripts/herdr-codex\" resume session-id");
  });

  it("rejects unsafe resume directories on every call", () => {
    for (const cwd of ["/tmp/qa'bad", "/tmp/qa\n"]) {
      const record = { agent: "codex", session: "12345678-1234-1234-1234-123456789abc", cwd };
      assert.equal(evaluate(`valid(${JSON.stringify(record)})`), false);
    }
    assert.equal(evaluate('valid({agent:"codex",session:"12345678-1234-1234-1234-123456789abc",cwd:"/tmp/qa"})'), true);
  });

  it("reads the Codex index once per watch and labels independent terminals concurrently", async () => {
    let reads = 0;
    let release;
    const writes = [];
    const evaluate = loadMod("resume", {
      terminals: () => [1, 2].map((id) => ({
        address: `t${id}`, title: `Task ${id} | /tmp`, keep: true, state: "live", pid: id,
        foreground: { argv: ["codex"], pid: id + 10, cwd: "/tmp" },
      })),
      readTextFile: () => { reads++; return new Promise((resolve) => { release = resolve; }); },
      hc: async (args) => { writes.push(args); },
      exec: async () => ({ code: 1, stdout: "" }),
      shared: () => [],
      setShared() {},
      localStorage: memoryStorage(),
      notify() {},
    });
    const pending = evaluate("new Resume().watch()");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal(writes.length, 0);
    release([1, 2].map((id) => JSON.stringify({ thread_name: `Task ${id}`, id: `12345678-1234-1234-1234-123456789ab${id}` })).join("\n"));
    await pending;
    assert.equal(writes.length, 2);
    assert.equal(reads, 1);
  });

  const addresses = (store) => plain((store["resume.waiting"] ?? []).map((w) => w.address));
  // Two tabs a restart turned into shells, each with a saved Claude session.
  function waitingSetup() {
    const session = (n) => `12345678-1234-1234-1234-12345678900${n}`;
    const labels = {
      t1: JSON.stringify({ agent: "claude", session: session(1), cwd: "/tmp/one", shell: 100 }),
      t2: JSON.stringify({ agent: "claude", session: session(2), cwd: "/tmp/two", shell: 200 }),
    };
    const store = {}, sent = [], notes = [], labelled = [];
    const evaluate = loadMod("resume", {
      terminals: () => ["t1", "t2"].map((a, i) => ({
        address: a, keep: true, state: "live", pid: 10 + i, foreground: { name: "zsh", argv: ["-zsh"] },
        labels: { resume: labels[a], "herdr.space": "sp", "herdr.tab": `tb${i + 1}` },
      })),
      spaces: () => [{ id: "sp", name: "daily", tabs: [{ id: "tb1", name: "postcraft" }, { id: "tb2", name: "mooncrab" }] }],
      hc: async ([cmd, address, arg]) => {
        if (cmd === "label") { labelled.push([address, arg]); labels[address] = arg.slice("resume=".length); }
        else sent.push([address, arg]);
        return { code: 0, stderr: "" };
      },
      // The transcripts exist; t2's was written more recently.
      exec: async (cmd, args) => {
        if (cmd === "test") return { code: 0, stdout: "" };
        if (cmd === "stat") return { code: 0, stdout: args.at(-1).includes("9001.jsonl") ? "1000\n" : "2000\n" };
        return { code: 1, stdout: "" };
      },
      home: () => "/home/test",
      shared: (k) => store[k],
      setShared: (k, v) => { store[k] = v; },
      localStorage: memoryStorage(),
      notify: (n) => notes.push(n),
    });
    return { evaluate, store, sent, notes, labelled, labels, mod: evaluate("new Resume()") };
  }

  it("shares the waiting sessions for the sidebar, latest first, with their tab", async () => {
    const { mod, store } = waitingSetup();
    await mod.watch();
    const waiting = plain(store["resume.waiting"]);
    assert.deepEqual(waiting.map((w) => [w.address, w.tab, w.space, w.agent, w.active]), [["t2", "mooncrab", "daily", "claude", 2000000], ["t1", "postcraft", "daily", "claude", 1000000]]);
  });

  it("resumes only the session the sidebar asked for", async () => {
    const { mod, store, sent } = waitingSetup();
    await mod.watch();
    store["resume.action"] = { kind: "resume", addresses: ["t1"], at: Date.now() };
    await mod.act();
    assert.equal(sent.map(([a]) => a).join(), "t1");
    assert.match(sent[0][1], /claude --resume 12345678-1234-1234-1234-123456789001$/);
    assert.equal(store["resume.action"], null);
    assert.deepEqual(addresses(store), ["t2"]);
  });

  it("forgets a dismissed session without typing anything, and keeps it gone", async () => {
    const { mod, store, sent, labels, notes } = waitingSetup();
    await mod.watch();
    store["resume.action"] = { kind: "forget", addresses: ["t2"], at: Date.now() };
    await mod.act();
    assert.equal(sent.length, 0);
    assert.equal(labels.t2, "");
    assert.deepEqual(addresses(store), ["t1"]);
    notes.length = 0;
    await mod.watch();
    assert.deepEqual(addresses(store), ["t1"]);
    assert.equal(notes.length, 0, "dismissing doesn't nudge again");
  });

  it("keeps a just-handled tab off the list while its label is still on the way", async () => {
    const { mod, store, labels } = waitingSetup();
    await mod.watch();
    const old = labels.t1;
    store["resume.action"] = { kind: "forget", addresses: ["t1"], at: Date.now() };
    await mod.act();
    labels.t1 = old; // terminals() still shows the label as it was
    await mod.watch();
    assert.deepEqual(addresses(store), ["t2"]);
  });

  it("ignores a stale or malformed action", async () => {
    const { mod, store, sent, labelled } = waitingSetup();
    await mod.watch();
    labelled.length = 0;
    store["resume.action"] = { kind: "forget", addresses: ["t1"], at: Date.now() - 60000 };
    await mod.act();
    store["resume.action"] = { kind: "forget", addresses: "t1", at: Date.now() };
    await mod.act();
    assert.equal(sent.length + labelled.length, 0);
  });

  it("lists nothing once every session is resumed", async () => {
    const { mod, store, sent } = waitingSetup();
    await mod.watch();
    await mod.resume();
    assert.equal(sent.length, 2);
    assert.deepEqual(addresses(store), []);
    await mod.watch();
    assert.deepEqual(addresses(store), []);
  });
});
