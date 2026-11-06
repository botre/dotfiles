// A strip under the chat with the shell commands Claude Code suggests on
// screen right now: the "! " lines of its replies. It follows the chat: scroll
// up to an older suggestion and it comes back, scroll past it and it goes.
// Run types the line into Claude, which runs it in its bash mode as if typed;
// the cross hides it while it stays on screen. A command that has run, here or typed, leaves the strip.
// The layout gives this block no height; it grows while there are commands.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { terminals, focused, hc, run, theme, props, notify } from "herdr";

const EVERY = 1500;
const ROW = 30;
const PAD = 8;
const MAX = 5;
// Claude indents its replies, so a suggestion starts after spaces; a command
// that ran (bash mode) starts at the edge.
const SUGGESTED_RE = /^( {2,})! (\S.*)$/;
const EXECUTED_RE = /^! +(\S.*)$/;
const LIST_OR_COMMAND_RE = /^\s*(! |[-*] )/;
// A wrapped row is nearly full; Claude breaks at spaces, so a little short.
const WRAP_SLACK = 24;
const RAN = "ran";
const KEEP_RAN = 200;

const norm = (command) => command.replace(/\s+/g, " ").trim();

// The suggested and the already run commands on a screen, each joined back
// from the rows it wraps onto (same indent, the row above nearly full).
export function screenCommands(screen, cols = 200) {
  const rows = screen.split("\n").map((r) => r.replace(/\s+$/, ""));
  const suggested = [], executed = new Set();
  for (let i = 0; i < rows.length; i++) {
    const s = SUGGESTED_RE.exec(rows[i]);
    const e = s ? null : EXECUTED_RE.exec(rows[i]);
    if (!s && !e) continue;
    let command = s ? s[2] : e[1];
    const indent = s ? s[1] : "  ";
    let last = rows[i];
    while (i + 1 < rows.length && last.length >= cols - WRAP_SLACK) {
      const next = rows[i + 1];
      if (!next.trim() || !next.startsWith(indent) || next[indent.length] === " " || LIST_OR_COMMAND_RE.test(next)) break;
      command += ` ${next.trim()}`;
      last = next;
      i++;
    }
    if (s) { if (!suggested.includes(norm(command))) suggested.push(norm(command)); }
    else executed.add(norm(command));
  }
  return { suggested, executed };
}

const isClaude = (t) => t?.state === "live" && (t.program?.key === "claude" || t.report?.app === "claude-code" || t.foreground?.name === "claude");

export default class Commands extends View {
  init(_props, cx) {
    this.commands = [];
    this.ran = new Set(JSON.parse(localStorage.getItem(RAN) ?? "[]"));
    this.dismissed = new Set();
    this.height = 0;
    cx.timer.every(EVERY, (cx) => cx.spawn(async (cx) => this.load(cx)));
    cx.spawn(async (cx) => this.load(cx));
  }

  remember(key) {
    this.ran.add(key);
    localStorage.setItem(RAN, JSON.stringify([...this.ran].slice(-KEEP_RAN)));
  }

  // The commands on the screen of the agent in view.
  async load(cx) {
    if (this.loading) return;
    this.loading = true;
    try {
      const f = focused();
      const address = f?.agent ?? f?.terminal;
      const terminal = terminals().find((t) => t.address === address);
      let commands = [];
      if (isClaude(terminal)) {
        const r = await hc(["read", address]).catch(() => null);
        if (r?.code === 0) {
          const { suggested, executed } = screenCommands(r.stdout, terminal.cols);
          for (const c of executed) if (!this.ran.has(`${address}:${c}`)) this.remember(`${address}:${c}`);
          const shown = new Set(suggested.map((c) => `${address}:${c}`));
          // A dismissal lasts while its line stays on screen.
          for (const key of this.dismissed) if (key.startsWith(`${address}:`) && !shown.has(key)) this.dismissed.delete(key);
          commands = suggested.filter((c) => !this.ran.has(`${address}:${c}`) && !this.dismissed.has(`${address}:${c}`));
        }
      }
      this.show(address, commands, cx);
    } finally { this.loading = false; }
  }

  show(address, commands, cx) {
    const key = `${address}\n${commands.join("\n")}`;
    if (key === this.key) return;
    this.key = key;
    this.address = address;
    this.commands = commands;
    this.fit();
    cx.notify();
  }

  // Grows the block to its rows, or back to nothing.
  fit() {
    const shown = Math.min(this.commands.length, MAX);
    const height = shown ? PAD * 2 + shown * ROW + (shown - 1) * 2 : 0;
    if (height === this.height) return;
    this.height = height;
    run("layout.resize", { id: props()?.block ?? "commands", px: height });
  }

  hide(command, cx) {
    this.show(this.address, this.commands.filter((c) => c !== command), cx);
  }

  // Run: Claude runs the line in its bash mode and then reads the output, as
  // when it is typed. hc waits until the person stops typing first.
  async send(command, cx) {
    this.remember(`${this.address}:${command}`);
    this.hide(command, cx);
    const r = await hc(["send", this.address, `! ${command}`]).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code !== 0) notify({ title: "Couldn't run the command", body: r.stderr?.trim() || undefined, level: "error" });
  }

  dismiss(command, cx) {
    this.dismissed.add(`${this.address}:${command}`);
    this.hide(command, cx);
  }

  render() {
    const t = theme();
    if (!this.commands.length) return div();
    const button = (id, label, onClick) => div()
      .id(id)
      .flex_none()
      .h(22)
      .px(8)
      .rounded(6)
      .flex()
      .items_center()
      .text_size(11.5)
      .cursor_pointer()
      .bg(t.solid)
      .text_color(t.solid_foreground)
      .hover((s) => s.opacity(0.9))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => onClick(cx))
      .child(label);
    const shown = this.commands.slice(0, MAX);
    const more = this.commands.length - shown.length;
    return v_flex()
      .size_full()
      .py(PAD)
      .px(4)
      .bg(t.canvas)
      .children(shown.map((command, i) => h_flex()
        .id(`command-${i}`)
        .h(ROW)
        .flex_none()
        .pl(10)
        .pr(4)
        .gap(8)
        .items_center()
        .rounded(8)
        .bg(t.raised)
        .border_1()
        .border_color(t.border)
        .when(i > 0, (el) => el.mt(2))
        .child(div().flex_none().text_size(12).font_bold().text_color(t.blocked).child("!"))
        .child(div().id(`command-text-${i}`).flex_1().min_w(0).truncate().font_family("JetBrains Mono").text_size(12)
          .text_color(t.foreground).tooltip(command).child(command))
        .when(i === shown.length - 1 && more > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`+${more} more`)))
        .child(button(`run-${i}`, "Run", (cx) => cx.spawn(async (cx) => this.send(command, cx))))
        .child(div()
          .id(`dismiss-${i}`)
          .flex_none()
          .p(4)
          .rounded(5)
          .text_color(t.dim)
          .cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Dismiss while it stays on screen")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => this.dismiss(command, cx))
          .child(svg("mods/pane/close.svg").size(12)))));
  }
}
