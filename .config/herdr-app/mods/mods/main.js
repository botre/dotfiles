// Lists the installed mods (ctrl-shift-m). Ours turn on and off at once: off
// hides their blocks and stops their work through the shared "mods.off"
// list, which they check. Clones switch between ours and Herdr's original by
// swapping the mod in the shown layout. Herdr's own mods are listed only.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, appHome, readTextFile, layout, run, shared, setShared, props, closeOverlay } from "herdr";
import * as fs from "fs/promises";

const SELF = "mods";
const OFF = "mods.off";
const SIDEBAR = { id: "sidebar", px: 268 };

function parse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function blocks(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.content?.mod) out.push({ id: node.id, mod: node.content.mod });
  for (const c of node.children ?? []) blocks(c, out);
  return out;
}

function swap(node, from, to) {
  const n = { ...node };
  if (n.content?.mod === from) n.content = { ...n.content, mod: to };
  if (Array.isArray(n.children)) n.children = n.children.map((c) => swap(c, from, to));
  return n;
}

export default class Mods extends View {
  init(_props, cx) {
    this.list = null;
    cx.spawn(async (cx) => {
      const home = appHome();
      const shipped = new Set(Object.keys(parse(await readTextFile(`${home}/installed.json`)) ?? {}));
      const names = (await fs.readdir(`${home}/mods`)).filter((n) => !n.startsWith(".")).sort();
      const list = [];
      for (const name of names) {
        const meta = parse((await readTextFile(`${home}/mods/${name}/mod.json`)) ?? "") ?? {};
        const kind = shipped.has(name) ? "herdr" : meta.cloned_from ? "clone" : "ours";
        list.push({ name, kind, from: meta.cloned_from?.name });
      }
      this.list = list;
      cx.notify();
    });
  }

  toggle(name, on) {
    const off = new Set(shared(OFF) ?? []);
    on ? off.delete(name) : off.add(name);
    setShared(OFF, [...off]);
    for (const b of blocks(layout()).filter((b) => b.mod === name)) run(on ? "layout.show" : "layout.hide", { id: b.id });
  }

  pill(t, id, label, active, onClick) {
    return div().id(id).px(10).py(3).rounded(6).text_size(12).cursor_pointer()
      .bg(active ? t.solid : t.raised).text_color(active ? t.solid_foreground : t.muted)
      .hover((s) => s.opacity(0.85))
      .on_click(onClick)
      .child(label);
  }

  row(t, name, note, controls) {
    return h_flex().h(34).px(12).gap(10).items_center().rounded(7).hover((s) => s.bg(t.hover))
      .child(div().w(120).truncate().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(note))
      .child(h_flex().gap(4).children(controls));
  }

  heading(t, text) {
    return div().px(12).pt(12).pb(4).text_size(11).font_semibold().text_color(t.dim).child(text);
  }

  render() {
    const t = theme();
    const placed = blocks(layout());
    const where = (name) => (placed.some((b) => b.mod === name) ? "in this layout" : "not placed");
    const off = new Set(shared(OFF) ?? []);
    const list = (this.list ?? []).filter((m) => m.name !== SELF);
    const ours = list.filter((m) => m.kind === "ours");
    const clones = list.filter((m) => m.kind === "clone");
    const herdr = list.filter((m) => m.kind === "herdr");
    const original = clones.filter((m) => m.from && !placed.some((b) => b.mod === m.name) && placed.some((b) => b.mod === m.from));

    return v_flex().id("mods").size_full().p(8).bg(t.popover).text_size(13).overflow_y_scrollbar()
      .child(h_flex().px(12).pt(4).justify_between().items_center()
        .child(div().font_semibold().text_color(t.foreground).child("Mods"))
        .child(div().id("close").text_size(12).text_color(t.muted).cursor_pointer().on_click(() => closeOverlay(props()?.overlay)).child("Close")))
      .child(this.heading(t, "Ours"))
      .children(ours.map((m) => {
        const on = !off.has(m.name);
        return this.row(t, m.name, on ? where(m.name) : "off", [
          this.pill(t, `on-${m.name}`, "On", on, () => this.toggle(m.name, true)),
          this.pill(t, `off-${m.name}`, "Off", !on, () => this.toggle(m.name, false)),
        ]);
      }))
      .when(clones.length > 0, (el) => el.child(this.heading(t, "Our versions of Herdr's mods")))
      .children(clones.map((m) => {
        const mine = placed.some((b) => b.mod === m.name);
        const swapTo = (to, from) => () => run("layout.set", { layout: swap(layout(), from, to) });
        return this.row(t, m.name, `of ${m.from}`, [
          this.pill(t, `ours-${m.name}`, "Ours", mine, swapTo(m.name, m.from)),
          this.pill(t, `herdr-${m.name}`, "Herdr's", !mine, swapTo(m.from, m.name)),
        ]);
      }))
      .when(original.length > 0, (el) => el.child(div().px(12).pt(4).text_size(11.5).text_color(t.working)
        .child("The layout now differs from the dotfiles copy.")))
      .child(this.heading(t, "Herdr's"))
      .child(div().px(12).text_size(12).text_color(t.muted).child(herdr.map((m) => m.name).join(", ")))
      .child(h_flex().px(12).pt(14).pb(4)
        .child(this.pill(t, "sidebar", "Reset sidebar width", false, () => run("layout.resize", SIDEBAR))));
  }
}
