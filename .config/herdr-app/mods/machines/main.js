// The sidebar footer: Settings, then every machine with its status (this
// computer first), then Add machine. Clicking a machine opens its menu.
//
// One copy sits in the footer and does the work. Copies opened with props
// { menu: name } or { rename: name } are the menu and the rename dialog; they
// hand their choice to the footer copy (shared ACTION + "machines.act"),
// since a popup's tasks end when it closes. Forget asks first through the
// confirm dialog, which runs "machines.act" too.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, run, hc, props, layout, machines, spaces, shared, setShared, updates, notify, openOverlay, closeOverlay, nextCommand, checking } from "herdr";
import { machineRows, machineMenu, menuHeight, footerHeight, STATUS_WORD, FOOTER } from "./model.js";

const ACTION = "machines.action";
const LIST = "machines.list";
const FOOTER_ID = "sidebar-footer";
// hc's machine list changes rarely; states also follow machines() at once.
const POLL = 15000;
// The sidebar lists' icon and status slots (GRID.icon, GRID.status).
const SLOT = 18;
const ICON = (name) => (name === "log-in" || name === "refresh" ? `mods/machines/${name}.svg` : `mods/workspace-chrome/${name}.svg`);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, as workspace-chrome has it.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

const rowsNow = () => machineRows(machines(), shared(LIST) ?? []);

export default class Machines extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.menu !== undefined) {
      this.handle = cx.focus_handle();
      this.handle.focus();
      this.at = 0;
      return;
    }
    if (p.rename) return this.initRename(p, cx);
    if (checking()) return;
    cx.spawn(async (cx) => this.load(cx));
    cx.timer.every(POLL, (cx) => cx.spawn(async (cx) => this.load(cx)));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        try { if (command === "act") await this.act(cx); } catch (e) { notify({ title: "Machines", body: String(e), level: "error" }); }
        cx.notify();
      }
    });
  }

  async load(cx) {
    const r = await hc(["machine", "ls", "--json"]).catch(() => null);
    if (r?.code !== 0) return;
    try {
      const list = JSON.parse(r.stdout).machines ?? [];
      if (JSON.stringify(list) !== JSON.stringify(shared(LIST) ?? [])) setShared(LIST, list);
    } catch { /* the last list stays */ }
    cx.notify();
  }

  // --- Actions, in the footer copy ------------------------------------------

  async act(cx) {
    const a = shared(ACTION);
    // Forget waits on the confirm dialog, so its hand-off lives longer.
    if (!a || Date.now() - a.at > 120000) return;
    setShared(ACTION, null);
    const name = a.machine ?? null;
    if (a.kind === "login") return this.login(name);
    const call = async (args, done, failed) => {
      const r = await hc(args).catch((e) => ({ code: 1, stderr: String(e) }));
      if (r.code === 0) notify({ title: done, level: "success", timeout: 3000 });
      else notify({ title: failed, body: r.stderr?.trim() || undefined, level: "error" });
      await this.load(cx);
    };
    if (a.kind === "update") {
      notify({ title: `Updating herdr-core on ${name}…`, timeout: 3000 });
      return call(["machine", "update", name], `Updated herdr-core on ${name}`, `Couldn't update ${name}`);
    }
    if (a.kind === "rename" && a.to && a.to !== name) return call(["machine", "rename", name, a.to], `Renamed ${name} to ${a.to}`, `Couldn't rename ${name}`);
    if (a.kind === "forget") return call(["machine", "rm", name], `Forgot ${name}`, `Couldn't forget ${name}`);
  }

  // Logging in asks for a password or code, so it runs in a terminal here.
  login(name) {
    const argv = ["hc", "machine", "login", name];
    const space = spaces().find((s) => !s.machine);
    if (space) run("tab.new", { space: space.id, name: `Log in to ${name}`, argv });
    else run("space.new", { machine: "", tab: `Log in to ${name}`, argv });
  }

  openMenu(row) {
    const items = machineMenu(row);
    if (!items.length) return;
    openOverlay({ mod: "machines", kind: "popup", width: 230, height: menuHeight(items), props: { menu: row.name ?? "" } });
  }

  // --- Menu -----------------------------------------------------------------

  choose(it, name, overlay) {
    if (!it?.enabled) return;
    closeOverlay(overlay);
    const hand = (kind) => { setShared(ACTION, { kind, machine: name, at: Date.now() }); };
    if (it.id === "rename") return openOverlay({ mod: "machines", kind: "dialog", width: 380, height: 170, props: { rename: name } });
    if (it.id === "forget") {
      hand("forget");
      return openOverlay({ mod: "confirm", kind: "dialog", width: 380, height: 150, props: {
        title: `Forget ${name}?`,
        detail: "Herdr stops reaching it. Its terminals keep running there, and you can add it again.",
        command: { name: "machines.act" },
      } });
    }
    hand(it.id);
    run("machines.act");
  }

  renderMenu(p) {
    const t = theme();
    const name = p.menu === "" ? null : p.menu;
    const row = rowsNow().find((r) => r.name === name) ?? { name, label: name, status: "unreachable" };
    const items = machineMenu(row);
    const live = items.map((it, i) => (it.enabled ? i : -1)).filter((i) => i >= 0);
    if (!live.includes(this.at)) this.at = live[0] ?? 0;
    return v_flex().id("machine-menu").track_focus(this.handle).w_full().min_h(0).p(5).gap(2).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        const k = live.indexOf(this.at);
        if (e.key === "down" && live.length) this.at = live[(k + 1) % live.length];
        else if (e.key === "up" && live.length) this.at = live[(k + live.length - 1) % live.length];
        else if (e.key === "enter") this.choose(items[this.at], name, p.overlay);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.notify();
      })
      .children(items.map((it, i) => it.divider
        ? div().mx(7).my(4).h(1).flex_none().bg(t.border)
        : h_flex().id(`mm-${it.id}`).h(31).px(8).gap(9).flex_none().rounded(7).items_center()
          .text_color(!it.enabled ? t.dim : it.danger ? t.blocked : t.foreground)
          .when(i === this.at && it.enabled, (el) => el.bg(t.selected))
          .when(it.enabled, (el) => el.hover((s) => s.bg(t.hover)))
          .on_click(() => this.choose(it, name, p.overlay))
          .child(svg(ICON(it.icon)).size(14).flex_none().text_color(it.danger && it.enabled ? t.blocked : t.muted))
          .child(div().flex_1().truncate().child(it.label))));
  }

  // --- Rename dialog --------------------------------------------------------

  initRename(p, cx) {
    this.input = InputState.new({ value: p.rename });
    this.input.set_selected_range({ start: 0, end: p.rename.length });
    this.input.on("submit", () => this.rename());
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  rename() {
    const p = props() ?? {};
    const to = this.input.value().trim();
    closeOverlay(p.overlay);
    if (!to || to === p.rename) return;
    setShared(ACTION, { kind: "rename", machine: p.rename, to, at: Date.now() });
    run("machines.act");
  }

  renderRename(p) {
    const t = theme();
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("machine-rename").track_focus(this.handle).w_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child(`Rename ${p.rename}`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(6).pb(10).text_size(11.5).text_color(t.dim).child("Addresses with the old name stop working."))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().pt(16).gap(8).justify_end()
        .child(button("mr-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("mr-save", "Rename", true, () => this.rename())));
  }

  // --- Footer ---------------------------------------------------------------

  render() {
    const p = props() ?? {};
    if (p.menu !== undefined) return this.renderMenu(p);
    if (p.rename) return this.renderRename(p);
    const t = theme();
    const collapsed = narrow();
    const rows = rowsNow();
    // The footer grows with the machines: its height lives in the layout.
    const want = footerHeight(rows.length, collapsed);
    const node = find(layout(), FOOTER_ID);
    if (node && node.size?.px !== want && this.asked !== want) {
      this.asked = want;
      run("layout.resize", { id: FOOTER_ID, px: want });
    }
    const dotColor = { ready: t.ansi2, login: t.ansi3, connecting: t.dim, unreachable: t.unknown ?? t.dim };
    const dot = (status) => div().size(7).flex_none().rounded_full().bg(dotColor[status]);
    const row = (id, icon, label, opts = {}) => h_flex().id(id).h(FOOTER.row).px(8).gap(9).flex_none().items_center().rounded(8)
      .when(collapsed, (el) => el.relative().w(32).px(0).justify_center().tooltip(opts.tooltip ?? label))
      .text_color(opts.dim ? t.dim : t.muted)
      .when(Boolean(opts.action), (el) => el.hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().on_click(opts.action))
      // The icon and status slots are as wide as the lists' above, so both line up.
      .child(h_flex().w(SLOT).flex_none().justify_center().child(svg(ICON(icon)).size(14)))
      .when(!collapsed, (el) => el.child(div().flex_1().min_w(0).truncate().child(label)));
    const ready = div().size(6).rounded_full().bg(t.accent);
    // Machines first, a divider, then Settings at the bottom.
    return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(FOOTER.padTop).pb(FOOTER.padBottom).gap(FOOTER.gap).text_size(13)
      .when(collapsed, (el) => el.px(0).items_center())
      .when(!collapsed, (el) => el.child(h_flex().h(FOOTER.heading).flex_none().items_end().px(8).pb(5)
        .text_size(11.5).font_medium().text_color(t.dim).child("Machines")))
      .children(rows.map((m) => {
        const word = STATUS_WORD[m.status];
        return row(`machine-${m.name ?? "here"}`, m.name === null ? "monitor" : "server", m.label, {
          tooltip: word ? `${m.label}: ${word.toLowerCase()}` : m.label,
          // This computer has no menu.
          action: machineMenu(m).length ? () => this.openMenu(m) : null,
        })
          .when(!collapsed && Boolean(word), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(word)))
          .child(collapsed ? dot(m.status).absolute().top(5).right(6) : h_flex().w(SLOT).flex_none().justify_center().child(dot(m.status)));
      }))
      .child(row("machine-add", "plus", "Add machine", { dim: true, action: () => run("mod.open", { name: "machine-add" }) }))
      .child(div().h(1).my((FOOTER.divider - 1) / 2).flex_none().bg(t.border).when(collapsed, (el) => el.w(28)).when(!collapsed, (el) => el.w_full()))
      .child(row("settings", "settings", "Settings", { action: () => run("app.settings") })
        .when(Boolean(updates().app.ready), (el) => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)));
  }
}
