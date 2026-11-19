// A strip under the agent in view when its folder belongs to another project:
// "This agent works in <Project>." Move relabels the agent's tab, as Move to
// project does; the cross hides the strip for that agent and project. The
// project comes from the folder's origin remote, normalised as projects does.
// The layout gives this block no height; it grows while there is a suggestion.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, terminals, focused, exec, run, theme, props, shared, setShared, checking, layout } from "herdr";
import { GENERAL, PROJECT_LIST, PROJECT_PENDING, PROJECT_ACTION, PROJECT_FAVICONS, PROJECT_DISMISSED, MAIN_STACK, MAIN_START, liveProjects, tabProjects, projectIcon, projectIconView } from "./projects.js";

const EVERY = 1500;
const ROW = 30;
const PAD = 8;
// A folder's remote is read again after this long.
const REMOTE_TTL = 5 * 60 * 1000;

// Copied from projects/store.js (a mod can't import from another mod's
// folder); tests/herdr-project-suggest.test.mjs fails when the copies differ.
export function normalizeRemote(url) {
  const s = String(url ?? "").trim();
  if (!s) return null;
  let host, path, m;
  if ((m = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]*@)?([^/:?#]+)(?::\d*)?\/+([^?#]*)/i.exec(s))) {
    if (m[1].toLowerCase() === "file") return null;
    [, , host, path] = m;
  } else if ((m = /^(?:[^@/:]+@)?([^/:]+):(?!\/)(.+)$/.exec(s))) {
    [, host, path] = m;
    // "C:/repo" is a Windows path, not a host.
    if (host.length < 2) return null;
  } else return null;
  path = path.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "").replace(/^\/+/, "");
  if (!path || !host) return null;
  return `${host.toLowerCase()}/${path}`;
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The agent in view: its address, tab, folder and machine. Null when the
// focused pane runs no agent or has no folder.
export function agentInView(f, allPanes, allAgents, allSpaces) {
  const address = f?.agent ?? f?.terminal;
  if (!address) return null;
  const pane = allPanes.find((p) => p.terminal === address);
  const agent = allAgents.find((a) => a.address === address);
  if (!pane || !(agent || pane.program?.agent)) return null;
  const cwd = pane.cwd ?? f.cwd;
  if (!cwd) return null;
  const space = allSpaces.find((s) => (s.tabs ?? []).some((t) => t.id === pane.tab));
  return { address, tab: pane.tab, cwd, machine: space?.machine ?? null };
}

// The project to suggest, or null: the folder's remote names a project that
// exists, the agent's tab is in another one (or General), and the strip wasn't
// dismissed for this agent and that project.
export function suggestion(address, current, remote, projects, dismissed) {
  if (!address || !remote) return null;
  const proj = liveProjects(projects).find((p) => p.id === remote);
  if (!proj || proj.id === (current || GENERAL)) return null;
  if (dismissed?.[address] === proj.id) return null;
  return proj;
}

// The dismissals with one added, those of terminals that are gone dropped.
export function withDismissed(dismissed, address, project, live) {
  const kept = Object.fromEntries(Object.entries(dismissed ?? {}).filter(([a]) => live.has(a)));
  kept[address] = project;
  return kept;
}

export default class ProjectSuggest extends View {
  init(_props, cx) {
    this.remotes = new Map(); // "machine|folder" -> { id, at, loading? }
    this.shown = null;
    this.height = 0;
    if (checking()) return;
    cx.timer.every(EVERY, (cx) => this.look(cx));
  }

  // The folder's remote project as last read; reads it again when unknown or old.
  remoteOf(at, cx) {
    const key = `${at.machine ?? ""}|${at.cwd}`;
    const have = this.remotes.get(key);
    if (have && (have.loading || Date.now() - have.at < REMOTE_TTL)) return have.id;
    this.remotes.set(key, { id: have?.id ?? null, at: Date.now(), loading: true });
    cx.spawn(async (cx) => {
      const r = await exec("git", ["remote", "get-url", "origin"], { cwd: at.cwd, on: at.machine }).catch(() => null);
      this.remotes.set(key, { id: r?.code === 0 ? normalizeRemote(r.stdout) : null, at: Date.now() });
      this.look(cx);
    });
    return have?.id ?? null;
  }

  look(cx) {
    const allSpaces = spaces(), allPanes = panes();
    // The start page hides the tab in focus, so nothing to say about its agent.
    const start = find(layout(), MAIN_STACK)?.active === MAIN_START;
    const at = start ? null : agentInView(focused(), allPanes, agents(), allSpaces);
    let next = null;
    if (at) {
      const projects = shared(PROJECT_LIST) ?? [];
      const known = new Set(liveProjects(projects).map((p) => p.id));
      const terms = new Map(terminals().map((k) => [k.address, k]));
      const current = tabProjects(allSpaces, allPanes, terms, known, shared(PROJECT_PENDING)).get(at.tab) ?? GENERAL;
      const proj = suggestion(at.address, current, this.remoteOf(at, cx), projects, shared(PROJECT_DISMISSED));
      if (proj) next = { ...at, proj };
    }
    this.show(next, cx);
  }

  show(next, cx) {
    const key = next ? `${next.address}|${next.tab}|${next.proj.id}|${next.proj.name}|${JSON.stringify(next.proj.icon ?? {})}` : "";
    if (key === (this.key ?? "")) return;
    this.key = key;
    this.shown = next;
    const height = next ? PAD * 2 + ROW : 0;
    if (height !== this.height) {
      this.height = height;
      run("layout.resize", { id: props()?.block ?? "project-suggest", px: height });
    }
    cx.notify();
  }

  move(cx) {
    const s = this.shown;
    if (!s) return;
    setShared(PROJECT_ACTION, { kind: "move", tab: s.tab, id: s.proj.id, at: Date.now() });
    run("projects.act");
    this.show(null, cx);
  }

  dismiss(cx) {
    const s = this.shown;
    if (!s) return;
    const live = new Set(terminals().map((k) => k.address));
    setShared(PROJECT_DISMISSED, withDismissed(shared(PROJECT_DISMISSED), s.address, s.proj.id, live));
    this.show(null, cx);
  }

  // Drawn as the sidebar draws it (projects.js).
  icon(proj, t) {
    const ui = { div, h_flex, svg, image };
    return projectIconView(ui, t, projectIcon(proj, shared(PROJECT_FAVICONS) ?? {}), 16);
  }

  render() {
    const t = theme();
    const s = this.shown;
    if (!s) return div();
    const name = s.proj.name;
    return h_flex()
      .size_full()
      .py(PAD)
      .px(4)
      .bg(t.canvas)
      .child(h_flex()
        .id("project-suggest")
        .flex_1()
        .h(ROW)
        .pl(10)
        .pr(4)
        .gap(8)
        .items_center()
        .rounded(8)
        .bg(t.raised)
        .border_1()
        .border_color(t.border)
        .text_size(12)
        .child(this.icon(s.proj, t))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`This agent works in ${name}.`))
        .child(div()
          .id("project-suggest-move")
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
          .hover((st) => st.opacity(0.9))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => this.move(cx))
          .child(`Move to ${name}`))
        .child(div()
          .id("project-suggest-dismiss")
          .flex_none()
          .p(4)
          .rounded(5)
          .text_color(t.dim)
          .cursor_pointer()
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .tooltip("Don't suggest this again for this agent")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => this.dismiss(cx))
          .child(svg("mods/pane/close.svg").size(12))));
  }
}
