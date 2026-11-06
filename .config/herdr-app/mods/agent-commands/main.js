// A strip under the chat with the shell commands Claude Code suggested in its
// last reply: the lines that start with "! ". Run types the line into Claude,
// which runs it in its bash mode, as if typed; Insert types it without Enter.
// The layout gives this block no height; it grows while there are commands
// for the agent in view and goes back to nothing when there are none.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { terminals, focused, hc, exec, home, run, theme, props, notify } from "herdr";

const EVERY = 2000;
const ROW = 30;
const PAD = 8;
const MAX = 5;
// Enough of the end of a transcript to hold the last turn.
const TAIL_BYTES = "400000";
const BANG_RE = /^\s*!\s+(\S.*)$/;
const CONTROL_RE = /[\u0000-\u001f\u007f\u2028\u2029]/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NON_ALPHANUMERIC_RE = /[^A-Za-z0-9]/g;

function parse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// A prompt from the person, not a tool's result handed back to the model.
function isPrompt(entry) {
  if (entry?.type !== "user") return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  return Array.isArray(content) && content.some((c) => c?.type === "text");
}

// The "! " lines of every reply since the person's last prompt, in order, once
// each. One line each: a command that spans lines can't be typed as one.
export function suggestedCommands(jsonl) {
  const texts = [];
  for (const line of jsonl.split("\n").reverse()) {
    const entry = parse(line);
    if (!entry) continue;
    if (isPrompt(entry)) break;
    if (entry.type !== "assistant" || !Array.isArray(entry.message?.content)) continue;
    const text = entry.message.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n");
    if (text) texts.unshift(text);
  }
  const seen = new Set();
  const commands = [];
  for (const text of texts) {
    for (const line of text.split("\n")) {
      const m = BANG_RE.exec(line);
      const command = m?.[1].trim();
      if (!command || CONTROL_RE.test(command) || seen.has(command)) continue;
      seen.add(command);
      commands.push(command);
    }
  }
  return commands;
}

// The Claude Code session a terminal runs, and the folders its transcript may be under.
export function sessionOf(terminal) {
  const resume = parse(terminal?.labels?.resume ?? "") ?? {};
  const session = [terminal?.labels?.["herdr.session"], resume.session].find((s) => ID_RE.test(s ?? ""));
  if (!session) return null;
  const folders = [...new Set([resume.cwd, terminal.foreground?.cwd].filter((f) => typeof f === "string" && f.startsWith("/")))];
  return { session, folders };
}

const isClaude = (t) => t?.state === "live" && (t.program?.key === "claude" || t.report?.app === "claude-code" || t.foreground?.name === "claude");

export default class Commands extends View {
  init(_props, cx) {
    this.commands = [];
    this.ran = new Set();
    this.height = 0;
    cx.timer.every(EVERY, (cx) => cx.spawn(async (cx) => this.load(cx)));
    cx.spawn(async (cx) => this.load(cx));
  }

  // The commands for the agent in view, from the end of its transcript.
  async load(cx) {
    if (this.loading) return;
    this.loading = true;
    try {
      const f = focused();
      const address = f?.agent ?? f?.terminal;
      const terminal = terminals().find((t) => t.address === address);
      const found = isClaude(terminal) ? sessionOf(terminal) : null;
      let commands = [];
      if (found && !address.includes("/")) {
        for (const folder of found.folders) {
          const path = `${home()}/.claude/projects/${folder.replace(NON_ALPHANUMERIC_RE, "-")}/${found.session}.jsonl`;
          const r = await exec("tail", ["-c", TAIL_BYTES, path]).catch(() => null);
          if (r?.code !== 0) continue;
          commands = suggestedCommands(r.stdout);
          break;
        }
      }
      const key = `${address}:${commands.join("\n")}`;
      if (key !== this.key) {
        this.key = key;
        this.address = address;
        this.session = found?.session ?? null;
        this.commands = commands;
        this.fit();
        cx.notify();
      }
    } finally { this.loading = false; }
  }

  // Grows the block to its rows, or back to nothing.
  fit() {
    const shown = Math.min(this.commands.length, MAX);
    const height = shown ? PAD * 2 + shown * ROW : 0;
    if (height === this.height) return;
    this.height = height;
    run("layout.resize", { id: props()?.block ?? "commands", px: height });
  }

  // Run: Claude runs the line in its bash mode and then reads the output, as
  // when it is typed. hc waits until the person stops typing first.
  async send(command) {
    const r = await hc(["send", this.address, `! ${command}`]).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code !== 0) { notify({ title: "Couldn't run the command", body: r.stderr?.trim() || undefined, level: "error" }); return; }
    this.ran.add(`${this.session}:${command}`);
  }

  // Insert: puts the line in Claude's prompt to edit or send. Through the
  // clipboard, which gets its old text back afterwards.
  insert(command, cx) {
    const old = cx.read_from_clipboard();
    cx.write_to_clipboard(`! ${command}`);
    run("pane.focus", { terminal: this.address });
    run("terminal.paste");
    if (old !== undefined) cx.timer.after(500, (cx) => cx.write_to_clipboard(old));
  }

  render() {
    const t = theme();
    if (!this.commands.length) return div();
    const button = (id, label, solid, onClick) => div()
      .id(id)
      .flex_none()
      .h(22)
      .px(8)
      .rounded(6)
      .flex()
      .items_center()
      .text_size(11.5)
      .cursor_pointer()
      .when(solid, (el) => el.bg(t.solid).text_color(t.solid_foreground).hover((s) => s.opacity(0.9)))
      .when(!solid, (el) => el.border_1().border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
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
      .children(shown.map((command, i) => {
        const ran = this.ran.has(`${this.session}:${command}`);
        return h_flex()
          .id(`command-${i}`)
          .h(ROW)
          .flex_none()
          .px(10)
          .gap(8)
          .items_center()
          .rounded(8)
          .bg(t.raised)
          .border_1()
          .border_color(t.border)
          .when(i > 0, (el) => el.mt(2))
          .child(div().flex_none().text_size(12).font_bold().text_color(t.blocked).child("!"))
          .child(div().id(`command-text-${i}`).flex_1().min_w(0).truncate().font_family("JetBrains Mono").text_size(12)
            .text_color(ran ? t.muted : t.foreground).tooltip(command).child(command))
          .when(i === shown.length - 1 && more > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`+${more} more`)))
          .when(ran, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(13).flex_none().text_color(t.ansi2)))
          .child(button(`insert-${i}`, "Insert", false, (cx) => this.insert(command, cx)))
          .child(button(`run-${i}`, "Run", true, (cx) => cx.spawn(async (cx) => { await this.send(command); cx.notify(); })));
      }));
  }
}
