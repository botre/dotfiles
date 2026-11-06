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

  describe("agent-list inbox", () => {
    const local = (...args) => new Date(...args).getTime();
    const friday = local(2026, 10, 6, 14, 0); // Fri Nov 6 2026, 14:00
    const helpers = loadMods(["agent-list/inbox.js"]);
    const json = (expression, values) => JSON.parse(helpers(`JSON.stringify(${expression})`, values));

    it("parses settle and snooze labels and refuses anything else", () => {
      assert.deepEqual(json('parseSettled("1700:4")'), { at: 1700, turn: 4 });
      for (const bad of ['""', '"x:1"', '"1:"', "undefined"]) assert.equal(helpers(`parseSettled(${bad})`), null);
      assert.equal(helpers('parseSnoozed("1800")'), 1800);
      assert.equal(helpers('parseSnoozed("soon")'), null);
    });

    it("shows a label just written until the core has it, but not for ever", () => {
      const term = { address: "t1", labels: { "inbox.settled": "" } };
      const pending = { t1: { "inbox.settled": "5:1", at: 1000 } };
      assert.equal(helpers("labelOf(term, SETTLED, pending, 1500)", { term, pending }), "5:1");
      assert.equal(helpers("labelOf(term, SETTLED, pending, 7000)", { term, pending }), "");
      assert.equal(helpers("labelOf(term, SNOOZED, pending, 1500)", { term, pending }), "");
      assert.deepEqual(Object.keys(json('withPending({old:{at:1}, t2:{a:"1",at:9000}}, "t2", {b:"2"}, 10000)')), ["t2"]);
      assert.deepEqual(json('withPending({t2:{a:"1",at:9000}}, "t2", {b:"2"}, 10000)').t2, { a: "1", b: "2", at: 10000 });
    });

    it("offers snooze times soonest first, one per wake minute", () => {
      assert.deepEqual(json("presets(now)", { now: friday }).map((p) => [p.id, p.wake]), [
        ["hour", friday + 3600000], ["hours", friday + 3 * 3600000], ["evening", local(2026, 10, 6, 18)],
        ["tomorrow", local(2026, 10, 7, 9)], ["week", local(2026, 10, 9, 9)],
      ]);
      const sunday = local(2026, 10, 8, 20, 0);
      assert.deepEqual(json("presets(now)", { now: sunday }).map((p) => p.id), ["hour", "hours", "tomorrow"]);
    });

    it("names wake times by how far away they are", () => {
      const cases = [[local(2026, 10, 6, 18), "18:00"], [local(2026, 10, 7, 9), "Tomorrow 9:00"], [local(2026, 10, 9, 9, 5), "Mon 9:05"], [local(2026, 10, 20, 9), "Nov 20 9:00"]];
      for (const [wake, label] of cases) assert.equal(helpers("wakeLabel(wake, now)", { wake, now: friday }), label);
    });

    it("builds a one-line reference that can't submit the prompt", () => {
      const text = helpers('reference({address:"t3", title:"Fix \\"double\\"\\ncharge", cwd:"/home/u/acme", home:"/home/u"})');
      assert.equal(text, `[agent t3 "Fix 'double' charge" · ~/acme · read it with: hc read t3]`);
      assert.equal(helpers('reference({address:"t4"})'), '[agent t4 "t4" · read it with: hc read t4]');
    });

    const sidebar = (terms, extra = {}) => {
      const writes = [], notes = [], store = {};
      let pending = {};
      const evaluate = loadMods(["agent-list/inbox.js", "agent-list/main.js"], {
        hc: async (args) => { writes.push(args); return { code: 0, stderr: "" }; },
        notify: (n) => notes.push(n),
        shared: (key) => (key === "agent-list.pending" ? pending : undefined),
        setShared: (key, value) => { if (key === "agent-list.pending") pending = value; },
        localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
        run() {},
        ...extra,
      });
      const view = evaluate("new Agents()");
      Object.assign(view, { changed: {}, pins: [], woke: new Set(), listed: new Map(), terms: new Map(terms.map((t) => [t.address, t])) });
      const tasks = [];
      const cx = { spawn: (f) => tasks.push(f(cx)), notify() {}, timer: { after: (ms, f) => { if (ms === 0) f(cx); } } };
      const settle = async () => { await Promise.all(tasks); tasks.length = 0; };
      return { view, writes, notes, cx, settle, pendingOf: () => pending };
    };
    const plain = (value) => JSON.parse(JSON.stringify(value));
    const agent = (address, status, extra = {}) => ({ address, status, pane: `p-${address}`, space_name: "daily", tab_name: "Work", ...extra });

    it("keeps a settled agent on the shelf until a later turn or new work brings it back", async () => {
      const terms = [
        { address: "t1", turn: 4, labels: { "inbox.settled": "100:4" } },
        { address: "t2", turn: 5, labels: { "inbox.settled": "100:4" } },
        { address: "t3", turn: 4, labels: { "inbox.settled": "100:4" } },
      ];
      const { view, writes, cx, settle } = sidebar(terms);
      const list = [agent("t1", "idle"), agent("t2", "idle"), agent("t3", "working")];
      view.inbox(list, terms, () => 1, 1000, cx);
      await settle();
      assert.deepEqual([...view.shelf.keys()], ["t1"]);
      assert.deepEqual(writes.map((w) => w.join(" ")).sort(), ["label t2 inbox.settled=", "label t3 inbox.settled="]);
    });

    it("wakes a due snooze with a notification, and a blocked one without", async () => {
      const terms = [
        { address: "t1", labels: { "inbox.snoozed": "500" } },
        { address: "t2", labels: { "inbox.snoozed": "5000" } },
        { address: "t3", labels: { "inbox.snoozed": "5000" } },
      ];
      const { view, writes, notes, cx, settle } = sidebar(terms);
      view.inbox([agent("t1", "idle"), agent("t2", "blocked"), agent("t3", "done")], terms, () => 1, 1000, cx);
      await settle();
      assert.deepEqual([...view.shelf.keys()], ["t3"]);
      assert.equal(writes.length, 2);
      assert.equal(notes.length, 1);
      assert.deepEqual(plain(notes[0].action), { name: "agent.focus", args: { terminal: "t1" } });
      assert.ok(view.woke.has("t1"));
    });

    it("settles at once on screen, unpins, moves on, and undoes it all", async () => {
      const terms = [{ address: "t1", turn: 7, labels: {} }, { address: "t2", turn: 1, labels: {} }];
      const focus = [];
      const { view, writes, cx, settle, pendingOf } = sidebar(terms, { run: (name, args) => focus.push([name, args]) });
      view.pins = ["t1"];
      view.activeOrder = [agent("t1", "idle", { focused: true }), agent("t2", "idle")];
      await view.putAway(["t1"], "Settled", (a) => ({ "inbox.settled": `9:${view.terms.get(a).turn}`, "inbox.snoozed": "" }), cx);
      assert.equal(pendingOf().t1["inbox.settled"], "9:7");
      assert.deepEqual(plain(view.pins), []);
      assert.deepEqual(plain(focus), [["pane.focus", { pane: "p-t2" }]]);
      assert.equal(writes[0].join(" "), "label t1 inbox.settled=9:7 inbox.snoozed=");
      assert.equal(view.undo.items.length, 1);
      await view.undoLast(cx);
      await settle();
      assert.deepEqual(plain(view.pins), ["t1"]);
      assert.equal(writes[1].join(" "), "label t1 inbox.settled= inbox.snoozed=");
    });

    it("holds a run that just stopped in Working, except when it is blocked", () => {
      const { view } = sidebar([]);
      view.changed = { t1: { s: "idle", at: 1000, prev: "working" } };
      assert.equal(view.rank(agent("t1", "idle"), 2500), 2);
      assert.equal(view.rank(agent("t1", "idle"), 3500), 1);
      view.changed.t1.s = "blocked";
      assert.equal(view.rank(agent("t1", "blocked"), 2500), 4);
    });

    it("seeds a first-seen agent's time from the core, and later changes from the clock", () => {
      const { view } = sidebar([{ address: "t1", status_ms: 400 }, { address: "t2", status_ms: 99999 }]);
      view.track([agent("t1", "idle"), agent("t2", "idle")], 1000);
      assert.equal(view.changed.t1.at, 400);
      assert.equal(view.changed.t2.at, 1000, "a time from the future is not trusted");
      view.track([agent("t1", "working")], 2000);
      assert.deepEqual(plain(view.changed.t1), { s: "working", at: 2000, prev: "idle" });
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
