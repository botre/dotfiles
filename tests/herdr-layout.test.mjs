import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const layout = JSON.parse(readFileSync(new URL("../.config/herdr-app/layouts/bjorn.json", import.meta.url), "utf8"));

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function ids(node, out = []) {
  out.push(node.id);
  for (const child of node.children ?? []) ids(child, out);
  return out;
}

// The islands look: every panel a rounded card on a flat canvas.
describe("bjorn layout: the islands card look", () => {
  const CARD = { width: 1, color: "border" };

  it("keeps every block id unique", () => {
    const all = ids(layout);
    assert.equal(new Set(all).size, all.length);
  });

  it("floats the cards 12 px in from the window edge and 12 px apart, without dividers", () => {
    assert.equal(layout.background, "canvas");
    assert.equal(layout.padding, 12);
    assert.equal(layout.gap, 12);
    assert.equal(layout.divider, undefined);
    for (const id of ["sidebar", "sidebar-lists", "work", "work-body"]) assert.equal(find(layout, id).gap, 12, id);
    assert.equal(find(layout, "sidebar").background, undefined);
    assert.equal(find(layout, "sidebar").size.px, 366);
  });

  it("draws the sidebar's four blocks and the status row as 14 px chrome cards", () => {
    for (const id of ["brand", "projects", "agents", "sidebar-footer", "status-row"]) {
      const node = find(layout, id);
      assert.equal(node.radius, 14, id);
      assert.deepEqual(node.border, CARD, id);
      assert.equal(node.background, "chrome", id);
    }
    assert.equal(find(layout, "brand").content.mod, "sidebar-chrome");
    assert.equal(find(layout, "sidebar-footer").content.mod, "sidebar-chrome");
  });

  it("leaves the tab bar unpainted and frames panes as cards without an accent ring", () => {
    const tabs = find(layout, "tabs");
    assert.equal(tabs.background, undefined);
    assert.equal(tabs.border, undefined);
    const pane = find(layout, "main").content.pane;
    assert.equal(pane.radius, 14);
    assert.equal(pane.gap, 12);
    assert.equal(pane.background, "background");
    assert.deepEqual(pane.border, CARD);
    assert.deepEqual(pane.focus, CARD);
    assert.equal(find(layout, "project-start").radius, 14);
  });

  it("insets terminal text and lets the card's rounded fill show behind it", () => {
    assert.deepEqual(layout.terminal_padding, [16, 14]);
    assert.equal(layout.terminal_opacity, 0);
  });

  it("keeps the helper blocks in the status row, invisible", () => {
    const row = find(layout, "status-row").children.map((c) => c.id);
    for (const id of ["agent-context", "tab-titles", "resume", "terminal-palette"]) {
      assert.ok(row.includes(id), id);
      assert.deepEqual(find(layout, id).size, { px: 0 }, id);
    }
    assert.ok(row.includes("status") && row.includes("quota"));
  });
});
