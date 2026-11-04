import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, spaces, panes, shared, theme } from "herdr";
import { sessionRows, duration, clock, directoryName } from "./model.js";
import { ICON, STORE, focusSession } from "./ui.js";

const COLUMNS = [
  ["Session", 210], ["Goal", null], ["Current activity", null],
  ["Activity time", 100], ["Session length", 110], ["Updated", 90],
];

export function overview() {
  const t = theme(), now = Date.now();
  const rows = sessionRows(terminals(), agents(), spaces(), shared(STORE) ?? {}, panes());
  const cell = (content, index, muted = false) => div().px(14).py(14)
    .when(COLUMNS[index][1] !== null, (el) => el.w(COLUMNS[index][1]).flex_none())
    .when(COLUMNS[index][1] === null, (el) => el.flex_1().min_w(index === 1 ? 190 : 250))
    .text_color(muted ? t.muted : t.foreground).child(content);
  const icon = (p) => p?.icon
    ? (p.tint ? svg(p.icon).size(15).text_color(t.muted) : image(p.icon).size(15))
    : svg(ICON).size(15).text_color(t.muted);

  return v_flex().size_full().min_h(0).bg(t.background).text_size(13)
    .child(v_flex().px(28).py(24).gap(5).flex_none()
      .child(h_flex().gap(12).items_center()
        .child(svg(ICON).size(22).flex_none().text_color(t.muted))
        .child(div().flex_1().text_size(20).font_semibold().text_color(t.foreground).child("Agents"))
        .child(div().text_size(12).text_color(t.muted).child(`${rows.length} sessions`)))
      .child(div().pl(34).text_size(12).text_color(t.dim).child("All spaces · All connected machines")))
    .child(div().flex_1().min_h(0).overflow_scroll().child(v_flex().w_full().min_w(1000).px(14)
      .child(h_flex().w_full().border_b(1).border_color(t.border).text_size(11.5)
        .children(COLUMNS.map(([name], i) => cell(div().font_medium().child(name), i, true))))
      .children(rows.map((row) => h_flex().id(`overview-${row.address}`).w_full().items_start()
        .border_b(1).border_color(t.border).cursor_pointer().hover((el) => el.bg(t.hover))
        .on_click(() => focusSession(row))
        .child(cell(v_flex().gap(7)
          .child(h_flex().gap(8).items_center()
            .child(icon(row.program))
            .child(div().flex_1().min_w(0).truncate().tooltip(row.name).child(row.name))
            .child(div().size(6).flex_none().rounded(3).bg(t[row.status] ?? t.dim)))
          .child(div().text_size(11).text_color(t.dim).child(`${row.machine ?? "This computer"} · ${row.space}`))
          .when(Boolean(row.cwd), (el) => el.child(div().text_size(11).text_color(t.muted).truncate()
            .tooltip(`${row.cwd}${row.branch ? ` · ${row.branch}` : ""}`)
            .child(`${directoryName(row.cwd)}${row.branch ? ` · ${row.branch}` : ""}`))), 0))
        .child(cell(row.goal, 1))
        .child(cell(row.activity, 2, !row.reported))
        .child(cell(row.activityAt ? duration(now - row.activityAt) : "—", 3, true))
        .child(cell(row.startedAt ? duration(now - row.startedAt) : "—", 4, true))
        .child(cell(row.updatedAt ? clock(row.updatedAt, now) : "—", 5, true))))
      .when(rows.length === 0, (el) => el.child(div().p(20).text_color(t.dim).child("No active agent sessions.")))))
    .child(div().px(28).py(12).flex_none().text_size(11).text_color(t.dim)
      .child("Session length includes idle time since launch or resume. Click a session to open it."));
}
