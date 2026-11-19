# Herdr mods

Each mod's tests live in `tests/herdr-<mod>.test.mjs`, and a large mod adds
`tests/herdr-<mod>-<topic>.test.mjs` files. The Python scripts have
`tests/test_herdr_<script>.py`. Run tests from the repository root:

```sh
node --test --test-isolation=none tests/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_herdr_*.py'
```

## Agent context

`agent-context` collects instructions from mods in the current layout and mod
panes, excluding `mods.off`. Each provider declares its Markdown file in `mod.json`:

```json
{ "place": "none", "title": "My mod", "agent_context": "agent-context.md" }
```

Place that file beside `mod.json`. Instructions reach local and remote agents
through the `herdr.context` terminal label. Shared agent instructions read it
each turn. Each machine needs `hc`, Python 3, `scripts/herdr-context`, and those
shared instructions. The helper verifies Codex's thread before it reads context
or publishes labels. New and resumed Codex sessions use `herdr-codex`.

`terminal-palette` caches the window's foreground and background on each connected
machine. `herdr-codex` seeds those colors before Codex starts and adds `--no-daemon`.
Use it for Codex launches through `hc run` too. Each machine needs the executable
launcher at `~/scripts/herdr-codex`. Existing Codex processes need a resume to clear
colors they cached before the window attached.

## Projects

The `projects` sidebar replaces spaces in the `bjorn` layout. A project is a git
remote, such as `github.com/owner/repo`. Create one with the sidebar's +: pick a
folder in a repository with an `origin` remote, then add a name and an emoji or
favicon URL. The same remote on any machine is the same project. The fixed General
project holds everything else.

A tab belongs to the project its terminals carry in a `project=<id>` label. Tabs
without one are in General. A new tab joins the project selected when it opens.
Selecting a project fills the tab bar with its tabs from every space on every
connected machine. Ctrl+1..9 select the projects in sidebar order.

The sidebar lists the projects marked "Show in list", or else the five most recently
active ones. Search finds the rest. Right-click a project for New worktree, Show or
Hide, Edit and Delete. The agents list groups agents by project, General first.

Each machine keeps the list in `~/.local/state/herdr/projects.json`. Every minute,
and after each change, the sidebar merges the files of all connected machines and
writes the result back. The newest edit wins, and deletes stay as tombstones.
Each machine also keeps its project folders in `project-dirs.json`, and caches
favicons in `favicons/` beside it.

`projects/membership.js` decides which tab belongs where. The tab bar and the
agents list carry identical copies as `projects.js`, since a mod can't import
from another mod's folder. A test fails when the copies differ.

## Sessions

The sidebar overview icon opens the closable Agents tab across connected
machines. Click a row to open its session. Hover over its directory for the full
path and branch.
Helpers stay collapsed under their parent. Agents with their own tabs remain
separate sessions, and the header counts those primary sessions.

Agents publish labels through `python3 "$HOME/scripts/herdr-context" label`:

- Summaries: `summary.goal`, `summary.activity`, `summary.updated` (Unix seconds).
- Titles: `session.title`, `session.title.updated` (Unix seconds).

The newest agent report, status message, or recap supplies the activity. Transcript
checks run every 30 seconds. “Current” means the report covers the latest inspected
conversation. Later messages mark it “Last reported”; failed checks leave freshness
unknown. Unchanged activity text preserves its timer while its report stays current.
Status messages and recaps have no activity timer.

Recaps start disabled. Enable them in the overview to send conversation history
to each session's existing provider, OpenAI or Anthropic. Independent recaps run
only for missing or stale reports while the overview is visible. They fork the
native conversation, use a temporary directory, and leave the original unchanged. Requests wait
at least two minutes after a report, three minutes between launches, and ten
minutes between attempts for one session. Each request has a two-minute timeout.
Recaps stay in a private cache on the session's machine. Unsupported or ambiguous
sessions show unavailable freshness instead of guessed summaries.

Session length uses the foreground process age from `ps` and includes idle time.
A dash means unavailable. Existing Codex processes keep their old routing until
the user resumes them; the overview marks these sessions.

Manual tab names take precedence. Clear a name to restore automatic titles.
Temporary status titles such as "Action Required" are rejected.

Quota details open on hover.
