import { div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { theme, run } from "herdr";
import { duration, clock } from "./model.js";

export const ICON = "mods/agent-list/agents.svg";
export const STORE = "agents.sessions";

export function activityTime(row, now) {
  return row.activityAt ? duration(now - row.activityAt) : "No update yet";
}

export function details(row, now) {
  const t = theme();
  const field = (label, value) => h_flex().gap(14).items_start()
    .child(div().w(84).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).text_color(t.foreground).child(value));
  return v_flex().w(390).p(16).gap(12).rounded(10).bg(t.popover).border(1).border_color(t.border).shadow_md().text_size(12.5)
    .child(h_flex().gap(8).items_center()
      .child(svg(ICON).size(16).text_color(t.muted))
      .child(div().flex_1().min_w(0).font_semibold().text_color(t.foreground).child(row.name))
      .child(div().text_size(11).text_color(t[row.status] ?? t.dim).child(row.status)))
    .child(div().text_size(11).text_color(t.dim).child(`${row.machine ?? "This computer"} · ${row.space}`))
    .child(field("Goal", row.goal))
    .child(field("Activity", row.activity))
    .when(Boolean(row.cwd), (el) => el.child(field("Directory", row.cwd)))
    .when(Boolean(row.branch), (el) => el.child(field("Branch", row.branch)))
    .child(field("On activity", activityTime(row, now)))
    .child(field("Session", row.startedAt ? duration(now - row.startedAt) : "Not available"))
    .child(field("Updated", clock(row.updatedAt, now)));
}

export function hoverDetails(trigger, row, now) {
  return row ? HoverCard.new(`session-hover-${row.address}`).open_delay(500).close_delay(200)
    .w_full().flex_none()
    .anchor("top_left").trigger(trigger).content(details(row, now)) : trigger;
}

export function focusSession(row) { run("agent.focus", { terminal: row.address }); }
