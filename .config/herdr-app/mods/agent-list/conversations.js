import { appHome, readTextFile, exec, hc, shared, setShared, panes, spaces, terminals } from "herdr";
import { machineOf, needsRecap } from "./model.js";

export const OBSERVATIONS = "agents.conversations";
export const RECAPS = "agents.recaps.enabled";

export class Conversations {
  constructor() { this.tried = 0; this.lastRecap = 0; }

  async sync(all, records) {
    const now = Date.now();
    if (now - this.tried < 30000) return;
    this.tried = now;
    const script = await readTextFile(`${appHome()}/mods/agent-list/conversations.py`);
    if (!script) return;
    const groups = new Map();
    for (const terminal of all) {
      const agent = terminal.program?.key === "codex" ? "codex" : terminal.program?.key === "claude" || terminal.report?.app === "claude-code" ? "claude" : null;
      if (!agent) continue;
      const on = machineOf(terminal.address);
      let saved;
      try { saved = JSON.parse(terminal.labels?.resume || "{}"); } catch { saved = {}; }
      const request = { address: terminal.address, pid: terminal.foreground?.pid, agent, title: terminal.title, session: saved.session };
      if (!groups.has(on)) groups.set(on, []);
      groups.get(on).push(request);
    }
    const before = shared(OBSERVATIONS) || {};
    const next = { ...before };
    await Promise.allSettled([...groups].map(async ([on, requests]) => {
      try {
        const result = await exec("python3", ["-c", script, "probe", JSON.stringify(requests)], { on });
        if (result.code !== 0) throw new Error("Conversation inspector failed");
        const values = JSON.parse(result.stdout);
        for (const value of values) {
          const current = terminals().find((t) => t.address === value.address);
          if (!current || current.foreground?.pid !== value.pid) continue;
          next[value.address] = { ...value, checkedAt: Date.now() };
          if (value.session && (current.labels?.["herdr.session"] !== value.session || current.labels?.["herdr.session.pid"] !== String(value.pid))) {
            await hc(["label", value.address, `herdr.session=${value.session}`, `herdr.session.pid=${value.pid}`]).catch(() => null);
          }
        }
      } catch (error) {
        for (const request of requests) {
          const current = terminals().find((t) => t.address === request.address);
          if (current?.foreground?.pid === request.pid) next[request.address] = { pid: request.pid, error: "Conversation unavailable", checkedAt: now };
        }
      }
    }));
    const live = new Set(all.map((t) => t.address));
    for (const address of Object.keys(next)) if (!live.has(address)) delete next[address];
    setShared(OBSERVATIONS, next);

    if (shared(RECAPS) !== true) return;
    // Only spend recap requests on primary sessions while their overview is visible.
    const shown = spaces().find((space) => space.active)?.tabs.find((tab) => tab.active)?.id;
    if (!panes().some((pane) => pane.tab === shown && pane.mod === "agent-list")) return;
    if (now - this.lastRecap < 180000) return;
    const ownPane = new Set(panes().filter((pane) => pane.terminal).map((pane) => pane.terminal));
    const candidate = all.find((t) => (!t.parent || ownPane.has(t.address)) && needsRecap(t, records[t.address] || {}, next[t.address], now));
    if (!candidate) return;
    const observation = next[candidate.address];
    const on = machineOf(candidate.address);
    const requests = groups.get(on) || [];
    const request = { ...requests.find((item) => item.address === candidate.address), session: observation.session };
    this.lastRecap = now;
    const args = ["run", "--bg", "--no-parent", "--no-notify", "--rm", "--name", `recap-${Date.now().toString(36)}`];
    if (on) args.push("--on", on);
    const result = await hc([...args, "--", "python3", "-c", script, "recap", JSON.stringify(request)]).catch(() => null);
    if (result?.code !== 0) {
      next[candidate.address] = { ...observation, recap: { error: "Recap could not start", at: now } };
      setShared(OBSERVATIONS, next);
    }
  }
}
