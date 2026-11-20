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
    // A resumed conversation (a new process) keeps the title it published; another conversation doesn't.
    const resumed = (session) => `publishedTitle({foreground:{pid:43},labels:{"session.title":"Fix alert contrast","session.title.updated":"300","session.title.pid":"42","session.title.session":"s1","herdr.session":"${session}","herdr.session.pid":"43"}}, {startedAt: 900000})`;
    assert.equal(evaluate(resumed("s1")), "Fix alert contrast");
    assert.equal(evaluate(resumed("s2")), null);
    assert.equal(evaluate('publishedTitle({foreground:{pid:43},labels:{"session.title":"Fix alert contrast","session.title.updated":"300","session.title.pid":"42","session.title.session":"s1","resume":"{\\"session\\":\\"s1\\"}"}})'), "Fix alert contrast");
  });

  it("drops spinner frames and a trailing status word, but keeps words that belong to the title", () => {
    const clean = (title) => evaluate(`cleanTitle(${JSON.stringify(title)})`);
    assert.equal(clean("Fix flaky tests \u280b"), "Fix flaky tests");
    assert.equal(clean("\u2733 Fix flaky tests \u00b7 Thinking\u2026"), "Fix flaky tests");
    assert.equal(clean("Fix flaky tests - working"), "Fix flaky tests");
    assert.equal(clean("Fix flaky tests | Running *"), "Fix flaky tests");
    assert.equal(clean("Stop thinking"), "Stop thinking");
    assert.equal(clean("Rooms 20-24 busy"), "Rooms 20-24 busy");
    assert.equal(clean("project | /tmp"), "project | /tmp");
    assert.equal(clean("\u280b Working"), null);
  });

  it("keeps a title's leading bracket or quote and drops Codex's attention mark", () => {
    const clean = (title) => evaluate(`cleanTitle(${JSON.stringify(title)})`);
    assert.equal(clean("[web] login flow"), "[web] login flow");
    assert.equal(clean("\u2733 [web] login flow"), "[web] login flow");
    assert.equal(clean("\u201cQuoted\u201d task"), "\u201cQuoted\u201d task");
    assert.equal(clean("[ ! ] Fix flaky tests"), "Fix flaky tests");
    assert.equal(clean("[ . ] Fix flaky tests"), "Fix flaky tests");
    assert.equal(evaluate('agentTitle({title:"[ ! ] Fix flaky tests | dotfiles"}, "codex")'), "Fix flaky tests");
  });

  it("reads a Claude session's name only after the person used /rename", () => {
    assert.equal(evaluate(`renamedTitle(${JSON.stringify(JSON.stringify({ name: "Sampler regions", nameSource: "user" }))})`), "Sampler regions");
    assert.equal(evaluate(`renamedTitle(${JSON.stringify(JSON.stringify({ name: "dotfiles-69", nameSource: "derived" }))})`), null);
    assert.equal(evaluate('renamedTitle("not json")'), null);
    assert.equal(evaluate("renamedTitle(null)"), null);
  });

  it("names a Claude tab from its /rename name ahead of published titles, reading each machine's file", async () => {
    const tabs = [{ id: "tb1", name: "1", named: false }, { id: "tb2", name: "2", named: false }];
    const commands = [], reads = [];
    const session = JSON.stringify({ name: "Sampler regions", nameSource: "user" });
    const evaluate = loadMod("tab-titles", {
      spaces: () => [{ tabs }],
      panes: () => [{ tab: "tb1", terminal: "t1", program: { agent: true, key: "claude" } }, { tab: "tb2", terminal: "vps/t2", program: { agent: true, key: "claude" } }],
      terminals: () => [
        { address: "t1", foreground: { argv: ["claude"], pid: 41 }, labels: { "session.title": "Published title", "session.title.updated": "300" } },
        { address: "vps/t2", foreground: { argv: ["/usr/bin/claude"], pid: 42 }, labels: {} },
      ],
      shared: (key) => key === "mods.off" ? [] : {},
      run: (command, args) => { commands.push(args); const tab = tabs.find((x) => x.id === args.id); tab.name = args.name; tab.named = true; },
      readTextFile: async (path) => { reads.push(path); return session; },
      exec: async (command, args, options) => { reads.push(`${options.on}:${args.at(-1)}`); return { code: 0, stdout: session }; },
      localStorage: memoryStorage(),
    });
    // Herdr builds views without running their constructor.
    const view = evaluate("Object.create(TabTitles.prototype)");
    view.sync();
    assert.equal(tabs[0].name, "Published title", "the first sync starts the read");
    await new Promise((resolve) => setTimeout(resolve, 0));
    view.sync();
    assert.deepEqual(reads, ["/home/test/.claude/sessions/41.json", "vps:42"]);
    assert.deepEqual(tabs.map((x) => x.name), ["Sampler regions", "Sampler regions"]);
    view.sync();
    assert.equal(reads.length, 2, "reads wait ten seconds between checks");
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

  it("retitles an agent tab a launcher named after the program, but keeps a person's name", () => {
    const tabs = [{ id: "tb1", name: "Codex", named: true }, { id: "tb2", name: "Codex review", named: true }];
    const commands = [], store = {};
    const evaluate = loadMod("tab-titles", {
      spaces: () => [{ tabs }],
      panes: () => tabs.map((tab, i) => ({ tab: tab.id, terminal: `t${i}`, program: { agent: true, key: "codex", name: "Codex" } })),
      terminals: () => tabs.map((_, i) => ({ address: `t${i}`, foreground: { argv: ["codex"] }, labels: { "session.title": "Review card reversal limits", "session.title.updated": "300" } })),
      shared: (key) => key === "mods.off" ? [] : {},
      run: (command, args) => commands.push({ command, args }),
      localStorage: memoryStorage(store),
    });
    evaluate("new TabTitles().sync()");
    assert.deepEqual(commands.map((c) => [c.args.id, c.args.name]), [["tb1", "Review card reversal limits"]]);
  });

  it("uses a recap title below published titles and never over a manual name", () => {
    const tabs = [
      { id: "tb1", name: "1", named: false }, { id: "tb2", name: "2", named: false },
      { id: "tb3", name: "My manual name", named: true }, { id: "tb4", name: "4", named: false },
    ];
    const commands = [];
    const labels = [{}, { "session.title": "Published title", "session.title.updated": "300" }, {}, { "summary.goal": "Agent goal" }];
    const observations = Object.fromEntries(tabs.map((_, i) => [`t${i}`, { pid: i === 3 ? 7 : 40 + i, recap: { title: `Recap title ${i}` } }]));
    const evaluate = loadMod("tab-titles", {
      spaces: () => [{ tabs }],
      panes: () => tabs.map((tab, i) => ({ tab: tab.id, terminal: `t${i}`, program: { agent: true, key: "codex" }, title: "Codex" })),
      terminals: () => tabs.map((_, i) => ({ address: `t${i}`, foreground: { argv: ["codex"], pid: 40 + i }, labels: labels[i] })),
      shared: (key) => key === "mods.off" ? [] : key === "agents.conversations" ? observations
        : key === "agents.sessions" ? { t3: { goal: "Agent goal" } } : {},
      run: (_command, args) => commands.push(args),
      localStorage: memoryStorage(),
    });
    evaluate("new TabTitles().sync()");
    const names = Object.fromEntries(commands.map((args) => [args.id, args.name]));
    assert.equal(names.tb1, "Recap title 0");
    assert.equal(names.tb2, "Published title");
    assert.equal(names.tb3, undefined);
    assert.equal(names.tb4, "Agent goal", "a recap from an earlier process is ignored");
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
