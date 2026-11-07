import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, plain } from "./mod-source.mjs";

describe("quota", () => {
  const files = {
    "/home/test/.claude/.credentials.json": JSON.stringify({ claudeAiOauth: { accessToken: "c", subscriptionType: "max" } }),
    "/home/test/.codex/auth.json": JSON.stringify({ tokens: { access_token: "x", account_id: "acct" } }),
  };
  const usage = {
    "https://api.anthropic.com/api/oauth/usage": {
      five_hour: { utilization: 40, resets_at: "2026-11-07T15:00:00Z" },
      limits: [
        { group: "weekly", percent: 12, resets_at: "2026-11-10T00:00:00Z", is_active: true },
        { group: "weekly", percent: 3, resets_at: "2026-11-10T00:00:00Z", scope: { model: { display_name: "Opus" } } },
        { group: "weekly", percent: 0, is_active: false, scope: { model: { display_name: "Haiku" } } },
      ],
    },
    "https://chatgpt.com/backend-api/wham/usage": {
      plan_type: "pro",
      rate_limit: { primary_window: { used_percent: 55, limit_window_seconds: 18000, reset_at: 1700000000 }, secondary_window: { used_percent: 9, limit_window_seconds: 604800, reset_at: 1700500000 } },
    },
  };
  const setup = ({ fail = new Set(), store = {} } = {}) => {
    const requests = [];
    const evaluate = loadMod("quota", {
      readTextFile: async (path) => files[path] ?? null,
      fetch: async (url, { headers }) => {
        requests.push({ url, headers });
        return fail.has(url) ? { ok: false, status: 503 } : { ok: true, json: async () => usage[url] };
      },
      shared: (key) => store[key], setShared: (key, value) => { store[key] = value; },
    });
    return { evaluate, requests, store };
  };

  it("reads Claude's 5-hour window and each active weekly limit, named by model", async () => {
    const { evaluate, requests } = setup();
    const claude = plain(await evaluate("claude()"));
    assert.equal(claude.plan, "max");
    assert.deepEqual(claude.windows.map((w) => [w.label, w.long, w.pct, w.secs]), [
      ["5h", "5 hours", 40, 18000], ["wk", "Week", 12, 604800], ["Opus wk", "Opus week", 3, 604800],
    ]);
    assert.equal(requests[0].headers.Authorization, "Bearer c");
  });

  it("reads Codex's windows by their length and sends the account it belongs to", async () => {
    const { evaluate, requests } = setup();
    const codex = plain(await evaluate("codex()"));
    assert.equal(codex.plan, "pro");
    assert.deepEqual(codex.windows.map((w) => [w.label, w.pct, w.resets]), [
      ["5h", 55, new Date(1700000000 * 1000).toISOString()], ["wk", 9, new Date(1700500000 * 1000).toISOString()],
    ]);
    assert.equal(requests[0].headers["ChatGPT-Account-Id"], "acct");
  });

  it("asks nothing for a signed-out or expired Claude login", async () => {
    const saved = files["/home/test/.claude/.credentials.json"];
    try {
      delete files["/home/test/.claude/.credentials.json"];
      assert.equal((await setup().evaluate("claude()")).error, "signed out");
      files["/home/test/.claude/.credentials.json"] = JSON.stringify({ claudeAiOauth: { accessToken: "c", expiresAt: 1 } });
      const { evaluate, requests } = setup();
      assert.equal((await evaluate("claude()")).error, "token expired");
      assert.equal(requests.length, 0);
    } finally { files["/home/test/.claude/.credentials.json"] = saved; }
  });

  it("keeps a provider's last good windows when it fails, with the error", async () => {
    const old = { name: "Codex", plan: "pro", windows: [{ label: "5h", pct: 20 }], at: 1 };
    const store = { "quota.data": { providers: [old] } };
    const { evaluate } = setup({ fail: new Set(["https://chatgpt.com/backend-api/wham/usage"]), store });
    const tasks = [];
    const cx = { spawn: (f) => tasks.push(f(cx)), notify() {} };
    evaluate("new Quota()").refresh(cx);
    await Promise.all(tasks);
    const [claude, codex] = plain(store["quota.data"].providers);
    assert.equal(claude.windows.length, 3);
    assert.deepEqual(codex, { ...old, error: "HTTP 503" });
  });
});
