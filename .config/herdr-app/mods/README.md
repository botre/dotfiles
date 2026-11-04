# Herdr mods

Run tests from the repository root:

```sh
node --test --test-isolation=none tests/*.test.mjs
```

## Agent context

`agent-context` collects instructions from mods in the current layout and mod
panes, excluding `mods.off`. Each provider declares its Markdown file in `mod.json`:

```json
{ "place": "none", "title": "My mod", "agent_context": "agent-context.md" }
```

Place that file beside `mod.json`. Instructions reach local and remote agents
through the `herdr.context` terminal label. Shared agent instructions read it
each turn. Each machine needs `hc`, `jq`, and those shared instructions.

## Sessions

The sidebar overview icon opens the closable Agents tab across connected
machines. Click a row to open its session. Hover over its directory for the full
path and branch.
Helpers stay collapsed under their parent. Agents with their own tabs remain
separate sessions, and the header counts those primary sessions.

Agents set these terminal labels with `hc label`:

- Summaries: `summary.goal`, `summary.activity`, `summary.updated` (Unix seconds).
- Titles: `session.title`, `session.title.updated` (Unix seconds).

Unchanged activity text preserves its timer. Session length uses the foreground
process age from `ps` and includes idle time. A dash means unavailable.

Manual tab names take precedence. Clear a name to restore automatic titles.
Temporary status titles such as "Action Required" are rejected.

Quota details open on hover.
