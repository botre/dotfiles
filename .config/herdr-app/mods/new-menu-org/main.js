import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, spaces, panes, knownAgents, run, openOverlay, closeOverlay, props, window, keys, shared, setShared } from "herdr";

// The last agents each machine reported, shown at once while knownAgents() checks again.
const KNOWN = "new-menu.agents";
// As every menu: popup padding, row height, the gap between rows, a heading's height.
const PAD = 5, ROW = 31, GAP = 2, HEADING = 26;
// New terminal, the heading, `agents` rows, the line (9), then three rows, with a gap between each.
const menuHeight = (agents) => PAD * 2 + ROW + HEADING + (agents * ROW + (agents - 1) * GAP) + 9 + 3 * ROW + 6 * GAP;

function shortcut(name) {
  const k = keys().find(b => b.section === "global" && b.action === name);
  if (!k?.keys.trim()) return "";
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return k.keys.trim().split(/\s+/).map(stroke => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map(m => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter(m => held.has(m)).map(m => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}

export default class NewMenu extends View {
  init(_props, cx) {
    const machine = spaces().find(s => s.active)?.machine;
    const where = machine ?? "";
    this.agents = shared(KNOWN)?.[where] ?? [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async cx => {
      try {
        this.agents = await knownAgents({ on: machine });
        setShared(KNOWN, { ...shared(KNOWN), [where]: this.agents });
      }
      catch { this.failed = true; }
      cx.notify();
    });
  }
  row(id, icon, name, action, hint = "", enabled = true) {
    const t = theme();
    return h_flex().id(id).h(ROW).px(8).gap(9).rounded(7).items_center().flex_none()
      .text_color(enabled ? t.foreground : t.dim).when(enabled, el => el.hover(s => s.bg(t.hover)))
      .on_click(() => { if (enabled) { closeOverlay(props().overlay); action(); } })
      .child(h_flex().w(14).flex_none().justify_center().child(icon)).child(div().flex_1().child(name)).child(div().text_size(11).text_color(t.dim).child(hint));
  }
  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const installed = this.agents.filter(a => a.installed);
    const choices = this.failed ? installed : [...installed, ...this.agents.filter(a => !a.installed).slice(0, 2)];
    const folder = () => panes().find(p => p.focused)?.cwd;
    return v_flex().min_h(0).w_full().h(Math.min(491, menuHeight(Math.max(1, choices.length + (this.failed ? 1 : 0))))).bg(t.popover).p(PAD).gap(GAP).text_size(12.8)
      .id("new-menu").track_focus(this.handle)
      .on_key_down((e) => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent) return;
        closeOverlay(props().overlay);
        run("tab.new", { name: agent.name, space: space?.id, argv: agent.run });
      })
      .child(this.row("terminal", svg("icons/shell.svg").size(14), "New terminal", () => run("tab.new", { space: space?.id }), shortcut("tab.new")))
      .child(div().px(8).pt(8).h(HEADING).flex_none().text_size(11).text_color(t.dim).child("Start an agent"))
      .child(v_flex().flex_1().min_h(0).gap(GAP).overflow_y_scrollbar()
        .children(choices.map((a, i) => this.row(a.key, a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14), a.name,
          () => run("tab.new", { name: a.name, space: space?.id, argv: a.run }), a.installed ? (i < 9 ? String(i + 1) : "") : "Not installed", a.installed)))
        .when(this.failed || this.agents.length === 0, el => el.child(div().px(8).py(6).text_color(t.dim).child(this.failed ? "Couldn't check installed agents" : "Checking installed agents…"))))
      .child(div().h(1).mx(7).my(4).flex_none().bg(t.border))
      .child(this.row("space", svg("mods/workspace-chrome/plus.svg").size(14), "New space", () => run("space.new"), shortcut("space.new")))
      .child(this.row("worktree", svg("mods/workspace-chrome/git-branch.svg").size(14), "New worktree…", () => openOverlay({ mod: "worktree-org", kind: "dialog", width: 440, height: 260, props: { space: space?.id, folder: folder(), action: "new" } }), "", Boolean(space)))
      .child(this.row("worktree-open", svg("mods/workspace-chrome/git-branch.svg").size(14), "Open worktree\u2026", () => openOverlay({ mod: "worktree-org", kind: "dialog", width: 560, height: 480, props: { space: space?.id, folder: folder(), action: "open" } }), "", Boolean(space)));
  }
}
