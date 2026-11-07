// The tab bar's actions menu. agent-tabs opens it as a popup from its ··· button,
// and hides the button while this mod is off in the Mods panel.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, spaces, run, closeOverlay, notify, props } from "herdr";
import { idleTabs } from "./cleanup.js";

// Each action: { id, icon, label, load(space) (async, its state), hint(state),
// enabled(state), run(space) (async) }. The menu loads each action's state when it opens.
const ACTIONS = [
  {
    id: "close-idle",
    icon: "mods/tab-actions/broom.svg",
    label: "Close idle tabs",
    load: space => idleTabs(space),
    hint: tabs => String(tabs.length),
    enabled: tabs => tabs.length > 0,
    // Checked again on click: a shell may have started something since the menu opened.
    run: async space => {
      const tabs = await idleTabs(space);
      for (const tab of tabs) run("tab.close", { id: tab.id });
      notify({ title: tabs.length ? `Closed ${tabs.length} idle ${tabs.length === 1 ? "tab" : "tabs"}` : "No idle tabs to close", level: tabs.length ? "success" : "info", timeout: 3000 });
    },
  },
];

// Loads every action's state for the shown space into view.actions, then redraws.
function loadActions(view, cx) {
  view.actions = {};
  const space = spaces().find(s => s.active);
  if (!space) return;
  for (const action of ACTIONS) {
    cx.spawn(async cx => {
      try { view.actions[action.id] = await action.load(space); }
      catch { view.actions[action.id] = null; }
      cx.notify();
    });
  }
}

function actionsMenu(view, overlay) {
  const t = theme();
  const space = spaces().find(s => s.active);
  return v_flex().id("tab-actions").size_full().min_h(0).bg(t.popover).p(5).text_size(12.8)
    .children(ACTIONS.map(action => {
      const state = view.actions?.[action.id];
      const enabled = Boolean(space) && state != null && !view.running && action.enabled(state);
      return h_flex().id(action.id).h(31).px(9).gap(10).rounded(7).items_center().flex_none()
        .text_color(enabled ? t.foreground : t.dim).when(enabled, el => el.hover(s => s.bg(t.selected)))
        // Closing the popup cancels this copy's tasks, so the action finishes before it closes.
        .on_click((_e, cx) => {
          if (!enabled) return;
          view.running = action.id;
          cx.notify();
          cx.spawn(async () => {
            try { await action.run(space); }
            finally { closeOverlay(overlay); }
          });
        })
        .child(svg(action.icon).size(14))
        .child(div().flex_1().child(action.label))
        .child(div().text_size(11).text_color(t.dim).child(state === undefined ? "…" : state === null ? "" : action.hint?.(state) ?? ""));
    }));
}

export default class TabActions extends View {
  init(_props, cx) {
    loadActions(this, cx);
  }

  render() {
    return actionsMenu(this, props()?.overlay);
  }
}
