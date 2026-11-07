import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, loadMods, memoryStorage, plain } from "./mod-source.mjs";

describe("agent-list", () => {
  describe("titles and overview", () => {
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

  describe("unreported agents", () => {
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

  describe("inbox", () => {
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
        localStorage: memoryStorage(store),
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

  describe("sub-agents", () => {
    const evaluate = loadMods(["agent-list/main.js"]);

    it("hands a parent its live sub-agents' statuses at any depth, an error as blocked and done as idle", () => {
      const all = [
        { address: "t2", parent: "t1", state: "live", status: "working" },
        { address: "t3", parent: "t2", state: "live", status: "error" },
        { address: "t4", parent: "t1", state: "live", status: "done" },
        { address: "t5", parent: "t1", state: "exited", status: "blocked" },
        { address: "t6", parent: "t9", state: "live", status: "blocked" },
      ];
      const listed = new Map([["t2", "idle"]]);
      assert.deepEqual(plain(evaluate('kidStatuses(all, "t1", listed)', { all, listed })), ["idle", "blocked", "idle"]);
    });

    it("shows a waiting agent as a dim spinner with its helper count, and the count only outside sections", () => {
      // Elements that record their builder calls; `when` applies its callback.
      const element = (kind) => {
        const calls = [{ kind }];
        const proxy = new Proxy({}, { get: (_, name) => name === "calls" ? calls : (...args) => {
          if (name === "when") return args[0] ? args[1](proxy) : proxy;
          calls.push([name, ...args.map((x) => x?.calls ?? x)]);
          return proxy;
        } });
        return proxy;
      };
      const evaluate = loadMods(["agent-list/main.js"], { div: () => element("div"), h_flex: () => element("h_flex"), svg: (path) => element(`svg ${path}`) });
      const t = { dim: "#999", working: "#0a0" };
      const render = (a, compact) => JSON.stringify(evaluate("Agents.prototype.status.call({}, t, a, compact)", { t, a, compact }).calls);
      const full = render({ address: "t1", status: "idle", waiting: 2 }, false);
      assert.match(full, /"tooltip","Waiting on 2 helpers"/);
      assert.match(full, /spinner\.svg.*"text_color","#999".*"spin",1800/);
      assert.match(full, /"child",\[\{"kind":"div"\},\["text_size",10\.5\],\["child","2"\]\]/);
      assert.match(render({ address: "t1", status: "done", waiting: 1 }, false), /"Waiting on 1 helper"/);
      assert.doesNotMatch(render({ address: "t1", status: "idle", waiting: 2 }, true), /"child","2"/);
      assert.doesNotMatch(render({ address: "t1", status: "idle" }, false), /Waiting on/);
    });

    it("counts the working helpers of an agent that has stopped, at any depth", () => {
      const all = [
        { address: "t2", parent: "t1", state: "live", status: "working" },
        { address: "t3", parent: "t2", state: "live", status: "working" },
        { address: "t4", parent: "t1", state: "live", status: "done" },
        { address: "t5", parent: "t1", state: "exited", status: "working" },
        { address: "t6", parent: "t1", state: "live" },
      ];
      const listed = new Map();
      const waits = (status) => evaluate("waitingOn(a, all, listed)", { a: { address: "t1", status }, all, listed });
      assert.equal(waits("idle"), 2);
      assert.equal(waits("done"), 2);
      assert.equal(waits("working"), 0, "a working agent shows its own spinner");
      assert.equal(waits("blocked"), 0, "a blocked agent shows Needs you");
      assert.equal(evaluate("waitingOn(a, all, listed)", { a: { address: "t4", status: "idle" }, all, listed }), 0);
    });
  });

  describe("row menu", () => {
    // Two local spaces and one on a remote machine; t1 is alone in the "Work" tab.
    const setup = (extra = {}) => {
      const state = {
        spaces: [
          { id: "sp1", name: "daily", active: true, tabs: [{ id: "tb1", name: "Work", named: true, panes: 1 }] },
          { id: "sp2", name: "side", tabs: [] },
          { id: "sp3", name: "vps", machine: "vps", tabs: [] },
          { id: "sp4", name: "later", tabs: [] },
        ],
        panes: [{ pane: "p1", terminal: "t1", tab: "tb1" }],
      };
      const commands = [], notes = [], store = {};
      const evaluate = loadMods(["agent-list/inbox.js", "agent-list/main.js"], {
        spaces: () => state.spaces, panes: () => state.panes, terminals: () => [{ address: "t1", labels: {} }],
        keys: () => [], shared: (key) => store[key], setShared: (key, value) => { store[key] = value; },
        run: (command, args) => commands.push([command, args]), notify: (n) => notes.push(n),
        ...extra(state),
      });
      const cx = { sleep: async () => {} };
      return { evaluate, state, commands, notes, store, cx, view: evaluate("new Agents()") };
    };

    it("offers rename and the other spaces on the agent's machine, but not from the snooze clock", () => {
      const { evaluate } = setup(() => ({}));
      const items = plain(evaluate('menuItems("t1")'));
      assert.equal(items[0].kind, "rename");
      assert.deepEqual(items.filter((it) => it.kind === "move").map((it) => [it.preset, it.label]), [["sp2", "side"], ["sp4", "later"]]);
      assert.ok(items.some((it) => it.heading === "Move to"));
      const clock = plain(evaluate('menuItems("t1", { snoozeOnly: true })'));
      assert.ok(clock.every((it) => it.kind === "snooze"));
      assert.ok(plain(evaluate('menuItems("t9")')).every((it) => it.kind !== "move" && it.heading !== "Move to"), "an agent without a pane can't move");
    });

    it("renames the agent's tab through Herdr's prompt", async () => {
      const { view, commands, store, cx } = setup(() => ({}));
      store["agent-list.action"] = { kind: "rename", address: "t1", at: Date.now() };
      await view.command("act", cx);
      assert.deepEqual(plain(commands), [["tab.rename", { id: "tb1" }]]);
      assert.equal(store["agent-list.action"], null);
    });

    it("moves an agent to a new tab of another space, keeps its tab name, and returns to the space in view", async () => {
      const { view, commands, notes, cx } = setup((state) => ({
        run: (command, args) => {
          commands.push([command, args]);
          if (command === "terminal.park") state.panes = [];
          if (command === "terminal.keep") {
            state.spaces[1].tabs.push({ id: "tb9", name: "t1", panes: 1 });
            state.panes = [{ pane: "p9", terminal: args.terminal, tab: "tb9" }];
          }
        },
      }));
      await view.move("t1", "sp2", cx);
      assert.deepEqual(plain(commands), [
        ["terminal.park", { terminal: "t1" }],
        ["space.select", { id: "sp2" }],
        ["terminal.keep", { terminal: "t1", place: "tab" }],
        ["tab.rename", { id: "tb9", name: "Work" }],
        ["space.select", { id: "sp1" }],
      ]);
      assert.equal(notes.at(-1).title, "Moved to side");
    });

    it("tells how to reach an agent whose pane never comes back", async () => {
      const { view, commands, notes, cx } = setup((state) => ({
        run: (command, args) => { commands.push([command, args]); if (command === "terminal.park") state.panes = []; },
      }));
      await view.move("t1", "sp2", cx);
      assert.deepEqual(commands.map(([command]) => command), ["terminal.park", "space.select", "terminal.keep", "space.select"]);
      assert.equal(notes.at(-1).level, "error");
      assert.match(notes.at(-1).body, /hc attach t1/);
    });
  });
});
