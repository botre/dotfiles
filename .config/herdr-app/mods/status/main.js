// Herdr's workspace-status (0.1.11), plus the pull request of the shown
// branch: its number, then checks and review state. A click opens it in the
// browser. Asks `gh`, read-only, every two minutes and when the space or
// branch changes.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, focused, theme, run, window, keys, exec } from "herdr";

const EVERY = 2 * 60 * 1000;
const FAILED = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const PENDING = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"]);

// The folder of the shown tab's terminal, where `gh` finds repo and branch.
function where(space) {
  const f = focused();
  const cwd = (f?.space === space.id && f.cwd) || panes().find((p) => p.tab === f?.tab && p.cwd)?.cwd || space.folder;
  return { cwd, on: space.machine, key: `${space.machine ?? ""}|${cwd}|${space.branch ?? ""}` };
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
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(h_flex().gap(10).items_center().child(label("branch", space.branch)).when(Boolean(pr), (e) => e.child(pr))))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
