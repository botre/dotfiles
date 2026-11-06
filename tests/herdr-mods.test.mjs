import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMods } from "./mod-source.mjs";

const loadMod = (name, globals = {}) => loadMods([`${name}/main.js`], { home: () => "/home/test", ...globals });

describe("Herdr mods", () => {
  describe("agent-list", () => {
    const evaluate = loadMod("agent-list");

    it("retains Unicode titles across repeated updates", () => {
      for (let i = 0; i < 3; i++) assert.equal(evaluate('clean("✦ Café project")'), "Café project");
      assert.equal(evaluate('clean(undefined)'), "");
    });

    it("opens one overview at the left, focuses it on repeat, and allows reopening after close", () => {
      const commands = [], timers = [];
      let panes = [];
      const evaluate = loadMod("agent-list", {
        panes: () => panes,
        spaces: () => [{ id: "sp1", active: true }],
        run: (command, args) => commands.push({ command, args }),
      });
      const agentList = evaluate("new Agents()");
      const cx = { timer: { after: (_ms, callback) => timers.push(callback) } };
      agentList.overview(cx);
      agentList.overview(cx);
      assert.equal(commands.length, 1);
      assert.equal(commands[0].command, "tab.new");
      panes = [{ pane: "p1", tab: "tb1", mod: "agent-list" }];
      timers.shift()(cx);
      assert.equal(commands[1].command, "tab.move");
      assert.equal(commands[1].args.index, 1);
      agentList.overview(cx);
      assert.equal(commands[2].command, "pane.focus");
      panes = [];
      agentList.overview(cx);
      assert.equal(commands[3].command, "tab.new");
    });
  });

  describe("tab-actions cleanup", () => {
    const shell = { shell: true, agent: false }, app = { shell: false, agent: false }, agent = { shell: false, agent: true };
    const load = (panes, terminals = [], hc = async () => ({ code: 1 })) =>
      loadMods(["tab-actions/cleanup.js"], { panes: () => panes, terminals: () => terminals, hc });
    const ids = async (evaluate, space, busy = []) =>
      [...(await evaluate("idleTabs(space, check)", { space, check: async address => !busy.includes(address) })).map(tab => tab.id)];
    const tab = (id, extra = {}) => ({ id, status: null, active: false, ...extra });

    it("finds tabs whose every pane is a shell at its prompt", async () => {
      const space = { tabs: [tab("shell"), tab("split"), tab("app"), tab("agent", { status: "idle" }), tab("mod"), tab("mixed"), tab("empty")] };
      const panes = [
        { tab: "shell", terminal: "t1", program: shell, status: null },
        { tab: "split", terminal: "t2", program: shell, status: null },
        { tab: "split", terminal: "t3", program: shell, status: null },
        { tab: "app", terminal: "t4", program: app, status: null },
        { tab: "agent", terminal: "t5", program: agent, status: "idle" },
        { tab: "mod", terminal: null, mod: "agent-list" },
        { tab: "mixed", terminal: "t6", program: shell, status: null },
        { tab: "mixed", terminal: "t7", program: app, status: null },
      ];
      assert.deepEqual(await ids(load(panes), space), ["shell", "split"]);
    });

    it("keeps a shell running a script that reports itself as a shell", async () => {
      const space = { tabs: [tab("sql"), tab("split"), tab("idle")] };
      const panes = [
        { tab: "sql", terminal: "t1", program: shell },
        { tab: "split", terminal: "t2", program: shell },
        { tab: "split", terminal: "t3", program: shell },
        { tab: "idle", terminal: "t4", program: shell },
      ];
      assert.deepEqual(await ids(load(panes), space, ["t1", "t3"]), ["idle"]);
    });

    it("counts a shell as at its prompt only when it is its own foreground process", async () => {
      const records = {
        t1: { state: "live", pid: 10, foreground: { pid: 10, name: "zsh" } },
        t2: { state: "live", pid: 20, foreground: { pid: 21, name: "bash" } },
        t3: { state: "exited", pid: 30, foreground: { pid: 30 } },
        t4: { state: "live", pid: 40 },
      };
      const evaluate = load([], [], async ([, address]) => records[address] ? { code: 0, stdout: JSON.stringify(records[address]) } : { code: 1, stdout: "" });
      for (const [address, expected] of [["t1", true], ["t2", false], ["t3", false], ["t4", false], ["t9", false]])
        assert.equal(await evaluate(`atPrompt("${address}")`), expected, address);
      assert.equal(await load([], [], async () => { throw new Error("unreachable"); })('atPrompt("t1")'), false);
      assert.equal(await load([], [], async () => ({ code: 0, stdout: "not json" }))('atPrompt("t1")'), false);
    });

    it("keeps a shell tab whose terminal started a live sub-agent", async () => {
      const space = { tabs: [tab("a"), tab("b")] };
      const panes = [{ tab: "a", terminal: "t1", program: shell }, { tab: "b", terminal: "t2", program: shell }];
      assert.deepEqual(await ids(load(panes, [{ address: "t9", parent: "t1", state: "live" }, { address: "t8", parent: "t2", state: "exited" }]), space), ["b"]);
    });

    it("keeps the shown tab when every tab is idle, so the space stays open", async () => {
      const space = { tabs: [tab("a"), tab("b", { active: true })] };
      const panes = [{ tab: "a", terminal: "t1", program: shell }, { tab: "b", terminal: "t2", program: shell }];
      assert.deepEqual(await ids(load(panes), space), ["a"]);
    });
  });

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
        localStorage: { getItem: () => null, setItem() {} },
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
        localStorage: { getItem: () => null, setItem() {} },
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
  });

  describe("tab-titles", () => {
    const evaluate = loadMod("tab-titles");

    it("cleans control characters and title prefixes repeatedly", () => {
      for (let i = 0; i < 3; i++) {
        assert.equal(evaluate('agentTitle({title:"✦ Café\\nproject | /tmp"}, "codex")'), "Café project");
      }
      assert.equal(evaluate('agentTitle({title:"Codex"}, "codex")'), null);
    });

    it("rejects temporary status titles and stale titles from a previous process", () => {
      for (const title of ["Action Required", "✦ Action Required | /tmp", "Waiting for approval", "Working", "Done"]) {
        assert.equal(evaluate(`agentTitle({title:${JSON.stringify(title)}}, "codex")`), null);
      }
      assert.equal(evaluate('publishedTitle({labels:{"session.title":"Review card reversal limits","session.title.updated":"100"}}, {startedAt:200000})'), null);
      assert.equal(evaluate('publishedTitle({labels:{"session.title":"Review card reversal limits","session.title.updated":"300"}}, {startedAt:200000})'), "Review card reversal limits");
      assert.equal(evaluate('publishedTitle({foreground:{pid:43},labels:{"session.title":"Old process title","session.title.updated":"300","session.title.pid":"42"}})'), null);
    });

    it("prefers published titles and leaves manual tab names alone", () => {
      const tabs = [{ id: "tb1", name: "1", named: false }, { id: "tb2", name: "My manual name", named: true }];
      const commands = [], store = {};
      const evaluate = loadMod("tab-titles", {
        spaces: () => [{ tabs }],
        panes: () => tabs.map((tab, i) => ({ tab: tab.id, terminal: `remote/t${i}`, program: { agent: true, key: "codex" }, title: "Action Required" })),
        terminals: () => tabs.map((_, i) => ({ address: `remote/t${i}`, foreground: { argv: ["codex"] }, labels: { "session.title": "Review card reversal limits", "session.title.updated": "300" } })),
        shared: (key) => key === "mods.off" ? [] : {},
        run: (command, args) => commands.push({ command, args }),
        localStorage: { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
      });
      evaluate("new TabTitles().sync()");
      assert.equal(commands.length, 1);
      assert.equal(commands[0].args.id, "tb1");
      assert.equal(commands[0].args.name, "Review card reversal limits");
      assert.equal(tabs[1].name, "My manual name");
    });

    it("retains automatic title ownership while spaces load or remote machines are offline", () => {
      let spaces = [];
      const store = { "tab-titles.set": JSON.stringify({ tb1: "Old title", "remote/tb2": "Remote title" }) };
      const commands = [];
      const evaluate = loadMod("tab-titles", {
        spaces: () => spaces,
        panes: () => [{ tab: "tb1", terminal: "t1", program: { agent: true, key: "codex" }, title: "Better title | /tmp" }],
        terminals: () => [{ address: "t1", foreground: { argv: ["codex"] } }],
        shared: (key) => key === "mods.off" ? [] : {},
        run: (_command, args) => commands.push(args),
        localStorage: { getItem: (key) => store[key], setItem: (key, value) => { store[key] = value; } },
      });
      evaluate("new TabTitles().sync()");
      assert.equal(JSON.parse(store["tab-titles.set"]).tb1, "Old title");
      spaces = [{ tabs: [{ id: "tb1", named: true, name: "Old title" }] }];
      evaluate("new TabTitles().sync()");
      assert.equal(commands[0].name, "Better title");
      assert.equal(JSON.parse(store["tab-titles.set"])["remote/tb2"], "Remote title");
    });

    it("retains home, root and trailing-slash folder names", () => {
      assert.equal(evaluate('folderName("/home/test")'), "~");
      assert.equal(evaluate('folderName("/")'), "/");
      assert.equal(evaluate('folderName("/tmp/qa///")'), "qa");
    });
  });
});
