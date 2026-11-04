// Publishes enabled mods' instructions to each agent's own core metadata.
// Remote agents can read them without connecting back to this window.
import { View, div } from "gpui-kit";
import { layout, panes, terminals, shared, setShared, appHome, readTextFile, hc } from "herdr";

const LABEL = "herdr.context";
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[A-Za-z0-9_.-]+\.md$/;

function placed(node, names = new Set()) {
  if (node?.content?.mod) names.add(node.content.mod);
  for (const child of node?.children ?? []) placed(child, names);
  for (const floating of node?.floating ?? []) placed(floating, names);
  return names;
}

export default class AgentContext extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => this.sync(cx));
    cx.timer.every(5000, (cx) => cx.spawn(async (cx) => this.sync(cx)));
  }

  async sync(cx) {
    if (this.busy) return;
    this.busy = true;
    try {
      const off = new Set(shared("mods.off") ?? []);
      const names = off.has("agent-context") ? new Set() : placed(layout());
      if (!off.has("agent-context")) for (const pane of panes()) if (pane.mod) names.add(pane.mod);
      const sections = [];
      for (const name of [...names].sort()) {
        if (!SAFE_NAME.test(name) || off.has(name)) continue;
        const folder = `${appHome()}/mods/${name}`;
        const raw = await readTextFile(`${folder}/mod.json`);
        if (!raw) continue;
        const meta = JSON.parse(raw);
        if (!meta.agent_context) continue;
        if (!SAFE_FILE.test(meta.agent_context)) throw new Error(`Invalid context file for ${name}`);
        const text = await readTextFile(`${folder}/${meta.agent_context}`);
        if (text === null) throw new Error(`Missing context file for ${name}`);
        sections.push(`## ${meta.title || name}\n\n${text.trim()}`);
      }
      const context = sections.length ? `# Herdr plugin context\n\n${sections.join("\n\n")}\n` : "";
      if (context.length > 24000) throw new Error("Herdr plugin context exceeds 24,000 characters");
      const targets = terminals().filter((t) => t.state === "live" && t.program?.agent);
      const results = await Promise.allSettled(targets.filter((t) => (t.labels?.[LABEL] ?? "") !== context)
        .map((t) => hc(["label", t.address, `${LABEL}=${context}`]).then((r) => {
          if (r.code !== 0) throw new Error(`Could not publish context to ${t.address}`);
        })));
      if (results.some((r) => r.status === "rejected")) throw new Error("Some agents are unreachable; context will retry");
      if (shared("agent-context.error")) setShared("agent-context.error", null);
    } catch (error) {
      const message = String(error);
      if (shared("agent-context.error") !== message) setShared("agent-context.error", message);
    } finally {
      this.busy = false;
      cx.notify();
    }
  }

  render() { return div(); }
}
