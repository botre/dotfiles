// The shown branch's pull request, checks and review state. A click opens it
// in the browser. Reads `gh` every two minutes and when the space or branch changes.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, focused, theme, run, window, keys, exec, shared } from "herdr";

// Claude Code and Codex as clean one-colour marks: the shipped icons are a pixel
// sprite that blurs when scaled and a logo on a white square.
const BRAND = { claude: ["mods/agent-list/icons/claude.svg", "#D97757"], codex: ["mods/agent-list/icons/codex.svg", "#6F7DFF"] };

const EVERY = 2 * 60 * 1000;
// The agents list publishes each agent's times here (agent-list/sessions.js).
const TIMES = "agents.times";
const FAILED = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const PENDING = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"]);

// The folder of the shown tab's terminal, where `gh` finds repo and branch.
function where(space) {
  const f = focused();
  const cwd = (f?.space === space.id && f.cwd) || panes().find((p) => p.tab === f?.tab && p.cwd)?.cwd || space.folder;
  return { cwd, on: space.machine, key: `${space.machine ?? ""}|${cwd}|${space.branch ?? ""}` };
}

// The program of the agent in the focused pane (Claude Code, Codex), or null
// when that pane runs no agent or its program has no icon.
export function focusedAgentProgram(f, allPanes, allAgents) {
  const address = f?.agent ?? f?.terminal;
  if (!address) return null;
  const agent = allAgents.find((a) => a.address === address);
  const program = agent?.program ?? allPanes.find((p) => p.terminal === address)?.program;
  return program?.icon && (agent || program.agent) ? program : null;
}

// The address of the agent in the focused pane, or null.
export function focusedAgentAddress(f, allPanes, allAgents) {
  const address = f?.agent ?? f?.terminal;
  if (!address) return null;
  return allAgents.some((a) => a.address === address) || allPanes.find((p) => p.terminal === address)?.program?.agent ? address : null;
}

// "<1m", "16m", "1h 49m", as the agents list writes them.
export function duration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

// "16:55" today, else "24/11 16:55".
export function clock(at, now = Date.now()) {
  const date = new Date(at), today = new Date(now);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return date.toDateString() === today.toDateString() ? time : `${date.getDate()}/${date.getMonth() + 1} ${time}`;
}

// The agent's times as [label, value, tooltip], leaving out what isn't known.
export function agentTimes(times, now = Date.now()) {
  if (!times) return [];
  return [
    times.activityAt && ["Active", `${duration(now - times.activityAt)} ago`, "Time since its last activity"],
    times.startedAt && ["Session", duration(now - times.startedAt), "Session length, idle time included, since launch or resume"],
    times.updatedAt && ["Updated", clock(times.updatedAt, now), "Its last report of what it works on"],
  ].filter(Boolean);
}

// statusCheckRollup mixes check runs (status, conclusion) and commit
// statuses (state).
function checks(rollup) {
  if (!rollup?.length) return null;
  const states = rollup.map((c) => c.conclusion || c.state || c.status);
  if (states.some((s) => FAILED.has(s))) return "fail";
  if (rollup.some((c) => (c.status && c.status !== "COMPLETED") || PENDING.has(c.state))) return "pending";
  return "pass";
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.pr = null;
    this.key = null;
    cx.timer.every(3000, (cx) => {
      const space = spaces().find((s) => s.active);
      if (space && where(space).key !== this.key) this.load(cx, space);
    });
    // The agent's times count up.
    cx.timer.every(15000, (cx) => cx.notify());
    cx.timer.every(EVERY, (cx) => {
      const space = spaces().find((s) => s.active);
      if (space) this.load(cx, space);
    });
  }

  load(cx, space) {
    const at = where(space);
    this.key = at.key;
    if (!space.branch) { this.pr = null; cx.notify(); return; }
    cx.spawn(async (cx) => {
      const r = await exec("gh", ["pr", "view", "--json", "number,url,state,isDraft,reviewDecision,statusCheckRollup"], { cwd: at.cwd, on: at.on })
        .catch(() => null);
      if (this.key !== at.key) return;
      let pr = null;
      try { pr = r?.code === 0 ? JSON.parse(r.stdout) : null; } catch {}
      this.pr = Number.isInteger(pr?.number) ? { ...pr, checks: checks(pr.statusCheckRollup) } : null;
      cx.notify();
    });
  }

  open() {
    const url = this.pr?.url;
    if (typeof url === "string" && url.startsWith("https://github.com/")) exec("xdg-open", [url]).catch(() => {});
  }

  prItem(t) {
    const pr = this.pr;
    if (!pr) return null;
    const mark = (icon, color, word) => h_flex().gap(3).child(div().text_color(color).child(icon)).child(div().text_color(t.dim).child(word));
    const check = { pass: mark("✓", t.ansi2, "checks"), fail: mark("✗", t.blocked, "checks"), pending: mark("◌", t.working, "checks") }[pr.checks];
    const review = {
      APPROVED: mark("✓", t.ansi2, "review"),
      CHANGES_REQUESTED: mark("✎", t.blocked, "review"),
      REVIEW_REQUIRED: mark("◌", t.working, "review"),
    }[pr.reviewDecision];
    const closed = pr.state !== "OPEN";
    return h_flex().id("pr").gap(8).items_center().cursor_pointer().hover((s) => s.text_color(t.foreground))
      .on_click(() => this.open())
      .child(div().text_color(closed ? t.dim : t.muted).child(`#${pr.number}`))
      .when(closed, (el) => el.child(div().text_color(t.dim).child(pr.state.toLowerCase())))
      .when(!closed && pr.isDraft, (el) => el.child(div().text_color(t.dim).child("draft")))
      .when(!closed && Boolean(check), (el) => el.child(check))
      .when(!closed && Boolean(review), (el) => el.child(review));
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const pr = space?.branch ? this.prItem(t) : null;
    const program = focusedAgentProgram(focused(), panes(), list);
    const address = focusedAgentAddress(focused(), panes(), list);
    const times = agentTimes(address ? (shared(TIMES) ?? {})[address] : null);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(h_flex().gap(10).items_center()
        .when(Boolean(program), (el) => el.child(div().id("agent-program").flex_none().tooltip(program.name)
          .child(BRAND[program.key] ? svg(BRAND[program.key][0]).size(13).text_color(BRAND[program.key][1]) : program.tint ? svg(program.icon).size(13).text_color(t.muted) : image(program.icon).w(13).h(13))))
        .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer")))
      .when(Boolean(space?.branch), el => el.child(h_flex().gap(10).items_center().child(label("branch", space.branch)).when(Boolean(pr), (e) => e.child(pr))))
      .when(times.length > 0, (el) => el.child(h_flex().gap(12).items_center()
        .children(times.map(([name, value, tip]) => h_flex().id(`time-${name}`).gap(4).items_center().tooltip(tip)
          .child(div().text_color(t.dim).child(name)).child(div().child(value))))))
      .child(div().flex_1())
      // The left side describes the focused pane; the right side is window-wide.
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agent${list.length === 1 ? "" : "s"}`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} ${needs === 1 ? "needs" : "need"} you`))))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
