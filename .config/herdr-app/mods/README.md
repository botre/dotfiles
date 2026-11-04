# Herdr mods

From the repository root, run the mod tests with:

```sh
node --test --test-isolation=none tests/*.test.mjs
```

## Agent context

The `agent-context` mod publishes instructions from enabled mods to the
`herdr.context` label on each live agent terminal, including connected machines.
The shared agent instructions read that label at the start of each turn.
Existing sessions need to load the updated instructions before they participate.

A mod opts in through its `mod.json`:

```json
{ "place": "none", "title": "My mod", "agent_context": "agent-context.md" }
```

Put its instructions in the named Markdown file beside `mod.json`. The context
includes mods in the current layout and mod panes. The `mods.off` list excludes
disabled mods. Providers supply plain-text instructions.
`python3 ~/scripts/herdr-context` prints the context inside a Herdr terminal.
Each machine needs the shared agent instructions; it only needs `hc` and `jq`
to read context, not a local Herdr window.

The agent list contributes the session summary convention. Agents publish
`summary.goal`, `summary.activity`, and `summary.updated` (Unix seconds) with
`hc label`. Keep activity text unchanged on refresh to retain its start time.
Use the overview icon beside the sort button to open the closable Agents tab.
It covers all live agent sessions exposed by
the connected cores, including agents outside tabs. Rows open their sessions.
Each session shows its directory and, when its pane provides one, its branch.
Hover over the directory line to see the full path and branch.

Activity timers use explicit summary updates. Session length measures the current
foreground process through `ps`, includes idle time, and resets after a resume
that starts a new process. Unavailable session lengths appear as a dash in the
overview. Old summaries are discarded when a
new process starts. Summary timelines persist in Herdr shared state.
Quota indicators also show their details on hover.

The tab title mod contributes its own context. Agents publish `session.title`
and `session.title.updated` (Unix seconds). The mod prefers that title, then the
reported goal, then a useful conversation title. It rejects temporary status
titles such as "Action Required" and preserves manual tab names. Clear a tab's
name to let the mod name it again.
