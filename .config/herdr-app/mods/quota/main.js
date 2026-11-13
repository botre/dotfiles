// Plan usage for Claude Code and Codex in the status bar: one limit window per
// provider, coloured by pace, with a tick for how far the window has run. A hover
// opens every window; a click on one shows it in the bar. Reads each CLI's own OAuth token and asks that
// vendor's usage endpoint; never refreshes or writes a token.

import { View, div } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { theme, home, readTextFile, shared, setShared, props, nextCommand } from "herdr";

const EVERY = 5 * 60 * 1000;
const STALE = 15 * 60 * 1000;
const NAME = "quota";
const KEY = "quota.data";
// The window each provider shows in the bar, by label. Kept across restarts.
const PICK = "quota.pick";

// Turned off in the Mods popup (ctrl-shift-m).
const off = () => (shared("mods.off") ?? []).includes(NAME);

async function json(path) {
  try { return JSON.parse((await readTextFile(path)) ?? "null"); } catch { return null; }
}

async function claude() {
  const c = (await json(`${home()}/.claude/.credentials.json`))?.claudeAiOauth;
  if (!c?.accessToken) return { name: "Claude", error: "signed out" };
  // Claude Code refreshes it the next time it runs.
  if (c.expiresAt && c.expiresAt < Date.now()) return { name: "Claude", error: "token expired" };
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${c.accessToken}`, "anthropic-beta": "oauth-2025-04-20", Accept: "application/json" },
  });
  if (!r.ok) return { name: "Claude", error: `HTTP ${r.status}` };
  const d = await r.json();
  const windows = [];
  if (d.five_hour) windows.push({ label: "5h", long: "5 hours", pct: d.five_hour.utilization, resets: d.five_hour.resets_at, secs: 5 * 3600 });
  for (const l of d.limits ?? []) {
    if (!l.is_active && !(l.percent > 0)) continue;
    const model = l.scope?.model?.display_name;
    const weekly = l.group === "weekly";
    windows.push({
      label: model ? `${model} ${weekly ? "wk" : ""}`.trim() : weekly ? "wk" : l.kind,
      long: model ? `${model} ${weekly ? "week" : ""}`.trim() : weekly ? "Week" : l.kind,
      pct: l.percent,
      resets: l.resets_at,
      secs: weekly ? 7 * 86400 : 5 * 3600,
    });
  }
  return { name: "Claude", plan: c.subscriptionType, windows };
}

async function codex() {
  const a = (await json(`${home()}/.codex/auth.json`))?.tokens;
  if (!a?.access_token) return { name: "Codex", error: "signed out" };
  const headers = { Authorization: `Bearer ${a.access_token}`, Accept: "application/json" };
  if (a.account_id) headers["ChatGPT-Account-Id"] = a.account_id;
  const r = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
  if (!r.ok) return { name: "Codex", error: `HTTP ${r.status}` };
  const d = await r.json();
  const windows = [];
  for (const w of [d.rate_limit?.primary_window, d.rate_limit?.secondary_window]) {
    if (!w) continue;
    const short = w.limit_window_seconds <= 5 * 3600;
    windows.push({
      label: short ? "5h" : "wk",
      long: short ? "5 hours" : "Week",
      pct: w.used_percent,
      resets: new Date(w.reset_at * 1000).toISOString(),
      secs: w.limit_window_seconds,
    });
  }
  return { name: "Codex", plan: d.plan_type, windows };
}

// The picked window, or the first when nothing is picked or the pick is gone.
function shown(p) {
  const want = (shared(PICK) ?? {})[p.name];
  return p.windows?.find((w) => w.label === want) ?? p.windows?.[0];
}

const failed = (name) => (e) => ({ name, error: String(e?.message ?? e) });

function left(iso) {
  const s = Math.max(0, (Date.parse(iso) - Date.now()) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// How far the window has run, which is also the use that lands on 100% at the reset.
const elapsed = (w) => Math.min(1, Math.max(0, 1 - (Date.parse(w.resets) - Date.now()) / 1000 / w.secs));

// Use minus the ideal, in whole points.
const gapOf = (w) => Math.round(w.pct) - Math.round(elapsed(w) * 100);

// Colour by pace, not by use: behind or on track is calm, ahead warns, far ahead or used up alarms.
const color = (t, w) => {
  const gap = gapOf(w);
  return w.pct >= 100 ? t.blocked : gap >= 10 ? t.ansi1 : gap > 0 ? t.working : t.accent;
};

// Use against the ideal: ["+2%", "ahead"], ["-9%", "behind"] or ["0%", "on track"].
function pace(w) {
  const gap = gapOf(w);
  return gap > 0 ? [`+${gap}%`, "ahead"] : gap < 0 ? [`${gap}%`, "behind"] : ["0%", "on track"];
}

function bar(t, w, width, height) {
  return div().relative().w(width).h(height).rounded(height / 2).bg(t.border).overflow_hidden()
    .child(div().absolute().left(0).top(0).h(height).w((width * Math.min(100, Math.max(0, w.pct))) / 100).bg(color(t, w)))
    .child(div().absolute().top(0).h(height).w(1).left(Math.round(width * elapsed(w))).bg(t.foreground).opacity(0.35));
}

export default class Quota extends View {
  init(_props, cx) {
    if (props()?.popup) return;
    // Checked often so that turning it back on refreshes stale data soon.
    cx.timer.every(30 * 1000, (cx) => {
      if (Date.now() - (this.tried ?? 0) >= EVERY) this.refresh(cx);
    });
    this.refresh(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "refresh") this.refresh(cx);
      }
    });
  }

  refresh(cx) {
    if (off()) return;
    this.tried = Date.now();
    cx.spawn(async (cx) => {
      const providers = await Promise.all([claude().catch(failed("Claude")), codex().catch(failed("Codex"))]);
      // Keep the last good windows of a provider that failed this time.
      const before = shared(KEY)?.providers ?? [];
      const merged = providers.map((p) => {
        const old = before.find((b) => b.name === p.name);
        return p.error && old?.windows ? { ...old, error: p.error } : { ...p, at: Date.now() };
      });
      setShared(KEY, { providers: merged });
      cx.notify();
    });
  }

  strip(t, data) {
    const items = (data?.providers ?? []).map((p) => {
      const stale = !p.at || Date.now() - p.at > STALE;
      const w = shown(p);
      return h_flex().gap(7).items_center().opacity(stale ? 0.6 : 1)
        .child(div().text_color(t.foreground).child(p.name))
        .children(w
          ? [div().text_color(t.dim).child(w.label), bar(t, w, 34, 4), div().child(`${Math.round(w.pct)}%`)]
          : [div().text_color(t.dim).child(p.error ?? "no limits")]);
    });
    // One card for the whole strip, so it lists every provider at once.
    const card = HoverCard.new("quota-hover").open_delay(400).close_delay(200)
      .anchor("bottom_right").trigger(h_flex().gap(16).items_center().children(items))
      .content(this.popup(t, data).w(502).rounded(8).border(1).border_color(t.border).shadow_md());
    return h_flex().id("quota").size_full().px(14).items_center().justify_end()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(data ? card : div().text_color(t.dim).child("quota…"));
  }

  // A table: one header, then each provider's name and its windows. Every row
  // takes its cell widths from COLS, so the columns line up.
  popup(t, data) {
    const COLS = [76, 100, 40, 40, 40, 52, 64];
    const RIGHT = new Set([2, 3, 4, 6]);
    const row = (cells, color) => h_flex().gap(10).items_center()
      .children(cells.map((c, i) => div().w(COLS[i]).flex_none().truncate()
        .when(RIGHT.has(i), (el) => el.text_right())
        .text_color(color(i)).child(c)));
    const header = row(["Window", "", "Used", "Ideal", "Pace", "", "Resets in"], () => t.dim).text_size(11);
    // With more than one window, a click picks the one the bar shows; a dot marks it.
    const windowRow = (p) => (w) => {
      const [gap, word] = pace(w);
      const ideal = `${Math.round(elapsed(w) * 100)}%`;
      const many = p.windows.length > 1, picked = many && shown(p) === w;
      const name = h_flex().gap(5).items_center()
        .when(many, (el) => el.child(div().size(5).flex_none().rounded(3).bg(picked ? t.foreground : t.border)))
        .child(div().truncate().child(w.long));
      return row([name, bar(t, w, COLS[1], 6), `${Math.round(w.pct)}%`, ideal, gap, word, left(w.resets)],
        (i) => (i === 2 ? t.foreground : i === 0 || i === 4 ? t.muted : t.dim))
        .when(many, (el) => el.id(`quota-${p.name}-${w.label}`).cursor_pointer().rounded(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => setShared(PICK, { ...(shared(PICK) ?? {}), [p.name]: w.label })));
    };
    return v_flex().id("quota-popup").p(12).gap(8).bg(t.popover).text_size(12.5)
      .child(header)
      .child(div().h(1).bg(t.border))
      .children((data?.providers ?? []).map((p) =>
        v_flex().gap(6).pt(2)
          .child(h_flex().gap(6)
            .child(div().font_semibold().text_color(t.foreground).child(p.name))
            .child(div().text_color(t.dim).child(p.plan ?? ""))
            .when(Boolean(p.error), (el) => el.child(div().text_color(t.dim).child(`· ${p.error}`))))
          .children((p.windows ?? []).map(windowRow(p)))))
      .child(div().pt(2).text_size(11).text_color(t.dim).child("Ideal is the use that reaches 100% right at the reset. The tick marks it. Click a window to show it in the bar."));
  }

  render() {
    const t = theme();
    const data = shared(KEY);
    return props()?.popup ? this.popup(t, data) : this.strip(t, data);
  }
}
