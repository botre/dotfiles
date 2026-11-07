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

  describe("agent-list unreported agents", () => {
    const evaluate = loadMods(["agent-list/inbox.js", "agent-list/main.js"]);
    it("lists a Claude or Codex pane that reports no status, with its status read from the title", () => {
      const listed = [{ address: "t1" }];
      const all = [
        { address: "t1", state: "live", foreground: { argv: ["/opt/claude-code/bin/claude"] }, title: "x" },
        { address: "t2", state: "live", foreground: { argv: ["/opt/claude-code/bin/claude"] }, title: "\u25D0 Telegram chat UI issues" },
        { address: "t3", state: "live", foreground: { name: "codex" }, title: "Review | ~/x" },
        { address: "t4", state: "live", foreground: { argv: ["/usr/bin/zsh"] }, title: "\u25D0 zsh" },
        { address: "t5", state: "live", foreground: { argv: ["claude"] }, title: "no pane" },
        { address: "t6", state: "finished", foreground: { argv: ["claude"] }, title: "gone" },
        { address: "t7", state: "live", foreground: { name: "codex", argv: ["node", "/usr/lib/node_modules/@openai/codex/bin/codex"] }, title: "\u2819 Fix | ~/y" },
      ];
      const panes = ["t1", "t2", "t3", "t4", "t6", "t7"].map((t, i) => ({ pane: `p${i}`, terminal: t, tab: "tb1", focused: t === "t2", program: { key: "claude" } }));
      const spaces = [{ id: "sp1", name: "daily", tabs: [{ id: "tb1", index: 1, name: "Calmdots" }] }];
      // terminals() drops the spinner; the titles read from hc keep it.
      const titles = new Map(all.map((t) => [t.address, t.title]));
      for (const t of all) t.title = t.title.replace(/^\S+ /, "");
      const rows = JSON.parse(evaluate("JSON.stringify(unreportedAgents(listed, all, panes, spaces, titles))", { listed, all, panes, spaces, titles }));
      assert.deepEqual(rows.map((r) => [r.address, r.status, r.pane, r.space_name, r.focused, r.unreported]), [
        ["t2", "working", "p1", "daily", true, true],
        ["t3", "idle", "p2", "daily", false, true],
        ["t7", "working", "p5", "daily", false, true],
      ]);
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

    it("settles or brings back the focused terminal even when it reports no status", async () => {
      const terms = [{ address: "t3", turn: 0, labels: { "inbox.settled": "5:0" } }];
      const { view, writes, cx } = sidebar(terms, { focused: () => ({ agent: null, terminal: "t3" }), agents: () => [] });
      view.rows = new Set(["t3"]);
      view.shelf = new Map([["t3", { kind: "settled", at: 5 }]]);
      await view.settleInView(cx);
      assert.equal(writes[0].join(" "), "label t3 inbox.settled=");
      view.rows = new Set();
      await view.settleInView(cx);
      assert.equal(writes.length, 1, "a terminal the list doesn't show is left alone");
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
        localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
        focused: () => ({ agent: null, terminal: "t1" }),
        terminals: () => [{ address: "t1", state: "live", cols: 200, program: { key: "claude" } }],
        hc: async (args) => { if (args[0] === "read") return { code: 0, stdout: screen }; sent.push(args); return { code: 0 }; },
        run: (name, args) => resizes.push(args.px), props: () => ({}), notify() {},
      });
      const view = evaluate("new Commands()");
      Object.assign(view, { ran: new Set(), dismissed: new Set(), height: 0 });
      const cx = { notify() {} };
      await view.load(cx);
      assert.deepEqual(JSON.parse(JSON.stringify(view.commands)), ["echo a", "echo b"], "echo c was typed already");
      await view.send("echo a", cx);
      assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))), ["send", "t1", "! echo a"]);
      view.dismiss("echo b", cx);
      await view.load(cx);
      assert.deepEqual(JSON.parse(JSON.stringify(view.commands)), []);
      assert.equal(resizes.at(-1), 0);
      screen = "  ! echo z";
      await view.load(cx);
      screen = "  ! echo a\n  ! echo b";
      await view.load(cx);
      assert.deepEqual(JSON.parse(JSON.stringify(view.commands)), ["echo b"], "a dismissal ends once its line leaves the screen; a run one stays gone");
    });
  });

  describe("agent-tabs", () => {
    const evaluate = loadMods(["agent-tabs/main.js"]);
    const ids = (expression, values) => JSON.parse(evaluate(`JSON.stringify(${expression}.map((t) => t.id))`, values));
    const tab = (id, active = false) => ({ id, active });
    const agentPane = (tabId, terminal) => ({ tab: tabId, terminal, program: { agent: true } });

    it("hides a tab only when every agent in it is snoozed, and never the tab in view", () => {
      const space = { tabs: [tab("a"), tab("b"), tab("c"), tab("d", true), tab("e"), tab("f"), tab("g")] };
      const all = [
        agentPane("a", "t1"),
        agentPane("b", "t2"), agentPane("b", "t3"),
        { tab: "c", terminal: "t4", program: { shell: true } },
        agentPane("d", "t5"),
        agentPane("e", "t6"),
        agentPane("f", "t7"),
        { tab: "g", terminal: "t8", program: { agent: false }, status: null },
        { tab: "g", terminal: "t9", program: { shell: true }, status: null },
      ];
      const terms = new Map([
        ["t1", { labels: { "inbox.snoozed": "5000" } }],
        ["t2", { labels: { "inbox.snoozed": "5000" } }],
        ["t4", { labels: { "inbox.snoozed": "5000" } }],
        ["t5", { labels: { "inbox.snoozed": "5000" } }],
        ["t6", { labels: { "inbox.snoozed": "500" } }],
        ["t8", { labels: { "inbox.snoozed": "5000" } }],
      ]);
      const pending = { t7: { "inbox.snoozed": "5000", at: 900 } };
      assert.deepEqual(ids("visibleTabs(space, all, terms, pending, 1000)", { space, all, terms, pending }), ["b", "d", "e"]);
      assert.deepEqual(ids("visibleTabs(space, all, terms, pending, 9000)", { space, all, terms, pending }), ["a", "b", "c", "d", "e", "f", "g"]);
    });

    it("numbers and steps through the tabs the bar shows", () => {
      const tabs = [tab("a"), tab("c", true), tab("e")];
      assert.equal(evaluate('tabFor("select-2", tabs).id', { tabs }), "c");
      assert.equal(evaluate('tabFor("select-4", tabs)', { tabs }), null);
      assert.equal(evaluate('tabFor("next", tabs).id', { tabs }), "e");
      assert.equal(evaluate('tabFor("prev", tabs).id', { tabs }), "a");
      assert.equal(evaluate('tabFor("next", [tabs[2], tabs[1]]).id', { tabs }), "e");
      assert.equal(evaluate('tabFor("other", tabs)', { tabs }), null);
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
        setShared() {},
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
        setShared() {},
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

    const addresses = (store) => JSON.parse(JSON.stringify((store["resume.waiting"] ?? []).map((w) => w.address)));
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
        localStorage: { getItem: () => null, setItem() {} },
        notify: (n) => notes.push(n),
      });
      return { evaluate, store, sent, notes, labelled, labels, mod: evaluate("new Resume()") };
    }

    it("shares the waiting sessions for the sidebar, latest first, with their tab", async () => {
      const { mod, store } = waitingSetup();
      await mod.watch();
      const waiting = JSON.parse(JSON.stringify(store["resume.waiting"]));
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
