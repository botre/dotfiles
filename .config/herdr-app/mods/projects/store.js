// Projects: the store and the sidebar's list, kept pure for tests.
//
// A project is a git remote ("github.com/owner/repo"), stored per machine in
// ~/.local/state/herdr/projects.json as [{id, name, icon, shown, updated_at, deleted?}].
// Machines merge by id: the newest updated_at wins and a deleted entry stays
// as a tombstone.

import { GENERAL, PROJECT_RECENT, generalProject, liveProjects, byProjectName } from "./membership.js";


// "git@github.com:Org/Repo.git", "https://user@GitHub.com/Org/Repo/" and
// "ssh://git@github.com:22/Org/Repo.git" all give "github.com/Org/Repo".
// Local paths and file:// remotes give null: they name no shared project.
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

// A project's default name: the remote's last part ("monorepo").
export const nameOf = (id) => String(id ?? "").split("/").filter(Boolean).pop() ?? "";

function clean(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || entry.id === GENERAL) return null;
  const at = Number(entry.updated_at);
  const icon = {};
  if (typeof entry.icon?.emoji === "string" && entry.icon.emoji.trim()) icon.emoji = entry.icon.emoji.trim();
  if (typeof entry.icon?.favicon === "string" && /^https?:\/\//i.test(entry.icon.favicon)) icon.favicon = entry.icon.favicon;
  const out = {
    id: entry.id,
    name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : nameOf(entry.id),
    icon,
    shown: entry.shown === true,
    updated_at: Number.isFinite(at) && at > 0 ? at : 0,
  };
  if (entry.deleted === true) out.deleted = true;
  return out;
}

// A store file's entries, or [] when it is missing or corrupt.
export function parseStore(text) {
  let value;
  try { value = JSON.parse(text ?? "[]"); } catch { return []; }
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

// One entry per id: the newest wins; on a tie a delete wins, then the larger
// JSON, so every machine picks the same one.
export function mergeProjects(...lists) {
  const byId = new Map();
  for (const list of lists) for (const raw of list ?? []) {
    const p = clean(raw);
    if (!p) continue;
    const have = byId.get(p.id);
    if (!have || p.updated_at > have.updated_at
      || (p.updated_at === have.updated_at && (Boolean(p.deleted) > Boolean(have.deleted)
        || (Boolean(p.deleted) === Boolean(have.deleted) && JSON.stringify(p) > JSON.stringify(have))))) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const serialize = (list) => `${JSON.stringify(mergeProjects(list), null, 2)}\n`;

// What a sync does with each reachable machine's file: the merged list (with
// `local`, this window's own edits) and the machines whose file differs.
// reads: [{ machine, text }] (text null: no file yet).
export function planSync(reads, local = []) {
  const projects = mergeProjects(local, ...reads.map((r) => parseStore(r.text)));
  const text = serialize(projects);
  return { projects, text, writes: reads.filter((r) => r.text !== text).map((r) => r.machine) };
}

// The list with one project added or changed (`fields`), stamped now.
export function upsert(list, id, fields, now = Date.now()) {
  const have = (list ?? []).find((p) => p.id === id);
  const next = clean({ ...(have && !have.deleted ? have : { id, shown: false, icon: {} }), ...fields, id, deleted: false, updated_at: Math.max(now, (have?.updated_at ?? 0) + 1) });
  return mergeProjects((list ?? []).filter((p) => p.id !== id), [next]);
}

// The list with a project deleted: a tombstone, so other machines drop it too.
export function remove(list, id, now = Date.now()) {
  const have = (list ?? []).find((p) => p.id === id);
  if (!have) return list ?? [];
  return mergeProjects((list ?? []).filter((p) => p.id !== id), [{ ...have, deleted: true, updated_at: Math.max(now, have.updated_at + 1) }]);
}

// The sidebar's list: General, then the projects marked shown, or without
// any, the five most recently active. Sorted by name so ctrl+N stays put.
export function listedProjects(list, active = {}, limit = PROJECT_RECENT) {
  const all = liveProjects(list);
  const shown = all.filter((p) => p.shown);
  const pick = shown.length ? shown : [...all].sort((a, b) => (active[b.id] ?? 0) - (active[a.id] ?? 0) || byProjectName(a, b)).slice(0, limit);
  return [generalProject(), ...[...pick].sort(byProjectName)];
}

// Every project matching the search, General included.
export function searchProjects(list, query) {
  const q = String(query ?? "").trim().toLowerCase();
  const all = [generalProject(), ...[...liveProjects(list)].sort(byProjectName)];
  return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : all;
}

export const machineOf = (address) => (String(address).includes("/") ? String(address).slice(0, String(address).lastIndexOf("/")) : null);

// Terminals in panes that weren't there at the last look, on machines that
// were already readable then (a machine that just connected brings old ones).
// seen: the addresses at the last look, or null on the first look.
export function freshTerminals(seen, readyBefore, panes) {
  if (!seen) return new Set();
  return new Set((panes ?? []).filter((p) => p.terminal && !seen.has(p.terminal) && readyBefore.has(machineOf(p.terminal))).map((p) => p.terminal));
}

// The labels to write on new terminals without one. A terminal joins its
// tab's project when the tab had terminals before (an unlabelled tab stays
// in General), and a new tab joins the selected project.
// labelFor: address -> its project label ("" without).
export function autoLabels(fresh, panes, labelFor, selected) {
  const out = [];
  for (const p of panes ?? []) {
    if (!p.terminal || !fresh.has(p.terminal) || labelFor(p.terminal)) continue;
    const mates = panes.filter((q) => q.tab === p.tab && q.terminal && q.terminal !== p.terminal);
    const labelled = mates.map((q) => labelFor(q.terminal)).find(Boolean);
    const older = mates.some((q) => !fresh.has(q.terminal));
    const project = labelled || (older ? null : selected);
    if (project && project !== GENERAL) out.push({ address: p.terminal, project });
  }
  return out;
}

// When the window last worked in each project. Only moves when at least
// `gap` ms passed, so busy agents don't rewrite shared state every frame.
// Returns the same object when nothing changed.
export function touchActive(active, ids, now = Date.now(), gap = 60000) {
  let next = active ?? {};
  for (const id of ids) {
    if (!id || id === GENERAL || now - (next[id] ?? 0) < gap) continue;
    if (next === active || next === undefined) next = { ...(active ?? {}) };
    next[id] = now;
  }
  return next;
}

// Where to download a favicon from when nothing better is found: an image URL
// as given, else the site's /favicon.ico. Null for a URL that isn't http(s).
// No URL class: the mod runtime may not have one.
const IMAGE_RE = /\.(png|ico|svg|jpe?g|gif|webp)$/i;
export function faviconSource(url) {
  const m = /^(https?:\/\/[^/?#\s]+)([^?#\s]*)([^\s]*)$/i.exec(String(url ?? "").trim());
  if (!m) return null;
  return IMAGE_RE.test(m[2]) ? m[0] : `${m[1]}/favicon.ico`;
}

// A stable file name stem for a favicon URL (FNV-1a), the same with or without
// a trailing slash.
export function faviconBase(url) {
  const src = String(url ?? "").trim().replace(/\/+$/, "");
  if (!faviconSource(src)) return null;
  let hash = 2166136261;
  for (const ch of src) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// The image extension of a URL, if its path names one.
export const imageExt = (url) => IMAGE_RE.exec(String(url ?? "").replace(/[?#].*$/, ""))?.[1]?.toLowerCase().replace("jpeg", "jpg") ?? null;

// Icons a page declares in its <link rel="...icon..."> tags, best first:
// apple-touch-icon (large PNG), then PNG or SVG icons, then the rest. Each
// href is made absolute against the page URL.
export function iconCandidates(html, pageUrl) {
  const page = /^(https?:)\/\/([^/?#\s]+)([^?#\s]*)/i.exec(String(pageUrl ?? "").trim());
  if (!page) return [];
  const [, scheme, host, path] = page;
  const dir = path.replace(/[^/]*$/, "") || "/";
  const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);
  const found = [];
  for (const tag of String(html ?? "").match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/\bicon\b/.test(rel) || rel.includes("mask")) continue;
    const abs = /^https?:\/\//i.test(href) ? href
      : href.startsWith("//") ? `${scheme}${href}`
      : href.startsWith("/") ? `${scheme}//${host}${href}`
      : /^[a-z][a-z0-9+.-]*:/i.test(href) ? null
      : `${scheme}//${host}${dir}${href}`;
    if (!abs) continue;
    const ext = imageExt(abs);
    const rank = rel.includes("apple-touch-icon") ? 0 : ext === "png" || ext === "svg" ? 1 : 2;
    found.push({ abs, rank });
  }
  const seen = new Set();
  return found.sort((a, b) => a.rank - b.rank).map((f) => f.abs).filter((u) => !seen.has(u) && seen.add(u));
}

// A colour picture of an emoji: Twemoji's SVG, named by its code points. The
// UI font can draw an emoji grey (a monochrome symbol font wins the fallback),
// and naming the colour emoji font draws nothing, so the icon is an image.
// Twemoji drops U+FE0F from a name unless the emoji joins parts with U+200D.
export function twemojiUrl(emoji) {
  const points = [...String(emoji ?? "").trim()].map((c) => c.codePointAt(0));
  if (!points.length) return null;
  const kept = points.includes(0x200d) ? points : points.filter((p) => p !== 0xfe0f);
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${kept.map((p) => p.toString(16)).join("-")}.svg`;
}

// The first letter of a name, for a project without an icon.
export const initial = (name) => ([...String(name ?? "").trim()][0] ?? "?").toUpperCase();
