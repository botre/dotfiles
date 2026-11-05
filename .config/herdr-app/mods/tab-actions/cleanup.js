import { panes, terminals, hc } from "herdr";

// A tab is idle when every pane in it is a shell waiting at its prompt: no agent,
// no program in the foreground, no mod pane, and no sub-agent started from it.
function idle(tab, all, terms) {
  if (tab.status) return false;
  const mine = all.filter(p => p.tab === tab.id);
  if (mine.length === 0) return false;
  if (mine.some(p => !p.terminal || p.status || p.program?.agent || !p.program?.shell)) return false;
  const addresses = new Set(mine.map(p => p.terminal));
  return !terms.some(t => t.state !== "exited" && (addresses.has(t.parent) || (t.parent && t.labels?.["herdr.tab"] === tab.id)));
}

// Tabs that look idle from the app's data. The program name alone can't be trusted:
// a script run by bash (sql_connect) reports itself as a bash shell.
export function candidateTabs(space) {
  if (!space) return [];
  const all = panes(), terms = terminals();
  return space.tabs.filter(tab => idle(tab, all, terms));
}

// A shell is at its prompt only when it is its own foreground process.
// Any failure counts as busy, so a tab is never closed on a guess.
export async function atPrompt(address) {
  try {
    const r = await hc(["get", address, "--json"]);
    if (r.code !== 0) return false;
    const t = JSON.parse(r.stdout);
    return t.state === "live" && Number.isInteger(t.pid) && t.foreground?.pid === t.pid;
  } catch {
    return false;
  }
}

// The idle tabs of a space, checked with herdr-core. When every tab is idle,
// the shown one stays, so the space stays open.
export async function idleTabs(space, check = atPrompt) {
  const all = panes();
  const found = [];
  for (const tab of candidateTabs(space)) {
    const checks = await Promise.all(all.filter(p => p.tab === tab.id).map(p => check(p.terminal)));
    if (checks.every(Boolean)) found.push(tab);
  }
  return found.length === space.tabs.length ? found.filter(tab => !tab.active) : found;
}
