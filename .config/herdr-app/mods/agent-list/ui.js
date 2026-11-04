import { run } from "herdr";

export const ICON = "mods/agent-list/agents.svg";
export const STORE = "agents.sessions";

export function focusSession(row) { run("agent.focus", { terminal: row.address }); }
