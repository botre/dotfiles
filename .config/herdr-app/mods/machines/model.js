// What the machines footer shows and offers, apart from drawing.

// This computer first, then each added machine by name. `layouts` is
// machines() (null names this computer), `added` is `hc machine ls --json`'s list.
export function machineRows(layouts, added) {
  const layoutOf = new Map((layouts ?? []).map((m) => [m.name ?? null, m.layout]));
  const rows = [{ name: null, label: "This computer", target: null, status: "ready" }];
  for (const m of [...(added ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    rows.push({ name: m.name, label: m.name, target: m.target ?? null, version: m.version ?? null, status: machineStatus(layoutOf.get(m.name), m.state) });
  }
  return rows;
}

// ready, login (it asks for a password or code), connecting or unreachable.
export function machineStatus(layout, state) {
  if (layout === "ready") return "ready";
  if (state === "needs_login" || state === "login_needed") return "login";
  if (layout === "loading") return "connecting";
  return "unreachable";
}

export const STATUS_WORD = { ready: "", login: "Needs login", connecting: "Connecting", unreachable: "Unreachable" };

// A machine's menu. This computer has none.
export function machineMenu(row) {
  if (row.name === null) return [];
  const items = [];
  if (row.status === "login") items.push({ id: "login", icon: "log-in", label: "Log in…", enabled: true });
  items.push({ id: "update", icon: "refresh", label: "Update herdr-core", enabled: row.status === "ready" });
  items.push({ divider: true });
  items.push({ id: "rename", icon: "square-pen", label: "Rename…", enabled: true });
  items.push({ id: "forget", icon: "x", label: "Forget…", enabled: true, danger: true });
  return items;
}

// Footer layout: padding, the Machines heading, a row per machine and Add
// machine, a divider, then Settings, with a 1px gap between items.
export const FOOTER = Object.freeze({ padTop: 4, padBottom: 8, row: 28, gap: 1, heading: 26, border: 1, divider: 9 });

export function footerHeight(count, collapsed = false) {
  const rows = count + 2;
  return FOOTER.border + FOOTER.padTop + FOOTER.padBottom + rows * FOOTER.row + FOOTER.divider + rows * FOOTER.gap + (collapsed ? 0 : FOOTER.heading);
}

// The popup's height for these items, as the agents list sizes its menus:
// 5 padding, 31 per row, 9 per divider, 2 between items.
export function menuHeight(items) {
  return 5 * 2 + items.reduce((h, it) => h + (it.divider ? 9 : 31), 0) + 2 * Math.max(0, items.length - 1);
}
