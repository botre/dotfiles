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

  describe("resume", () => {
    const evaluate = loadMod("resume");

    it("carries allowed inline flags and drops executable configuration", () => {
      assert.equal(evaluate('carry("codex", ["--model=gpt-6", "--no-daemon", "--profile=unsafe"]).join(" ")'), "--model gpt-6 --no-daemon");
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
        shared: () => [],
        localStorage: { getItem: () => null, setItem() {} },
        notify() {},
      });
      const pending = evaluate("new Resume().watch()");
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
