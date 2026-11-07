import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, memoryStorage } from "./mod-source.mjs";

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
      localStorage: memoryStorage(store),
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
      localStorage: memoryStorage(store),
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
