# Herdr mods

Each mod's tests live in `.config/herdr-app/tests/herdr-<mod>.test.mjs`, and a large mod adds
`.config/herdr-app/tests/herdr-<mod>-<topic>.test.mjs` files. The Python scripts have
`.config/herdr-app/tests/test_herdr_<script>.py`. Run tests from the repository root:

```sh
node --test --test-isolation=none .config/herdr-app/tests/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s .config/herdr-app/tests -p 'test_herdr_*.py'
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
favicon URL. The same remote on any machine is the same project. The fixed Scratch
project holds everything else.

A tab belongs to the project its terminals carry in a `project=<id>` label. Tabs
without one are in Scratch. A new tab joins the project selected when it opens.
Selecting a project fills the tab bar with its tabs from every space on every
connected machine. Ctrl+1..9 select the projects in sidebar order.

The sidebar lists the projects marked "Show in list", or else the five most recently
active ones. Search finds the rest. Right-click a project for New worktree, Show or
Hide, Edit and Delete. The agents list groups agents by project, Scratch first.
Its rows show the project's icon; Scratch agents and helpers keep the program's
icon. The bottom bar starts with the program icon of the agent in view.

Right-click an agent or a tab for Move to project. The picker relabels every
terminal in the tab and leaves the selected project as it is, so a tab moved
elsewhere leaves the bar. When an agent's folder has the remote of another
project, the `project-suggest` strip under the main area offers the move. Its
cross hides the offer for that agent and project.

A project without tabs shows a start page in the main area. It offers Claude Code,
Codex and a terminal in the project's folder, plus New worktree and Open worktree.
Scratch starts at home, and a project without a known folder starts there too.
The page sits in the layout's `main-stack` beside the tab block. The tab bar
switches that stack, so no placeholder tab exists. New tabs join the selected
project, and the page goes once the project has a tab.

All sits above Scratch and is not a project. It fills the tab bar with every tab
from every project, and it shows each kind of mod tab only once.
Focus stays on All when a tab of another project comes into view. A new tab
opened under All joins Scratch. Right-click Scratch or All for New terminal and the
agents: they start in this computer's home and join Scratch.

Each machine keeps the list in `~/.local/state/herdr/projects.json`. Every minute,
and after each change, the sidebar merges the files of all connected machines and
writes the result back. The newest edit wins, and deletes stay as tombstones.
Each machine also keeps its project folders in `project-dirs.json`, and caches
favicons in `favicons/` beside it.

`projects/membership.js` decides which tab belongs where. The tab bar and the
agents list carry identical copies as `projects.js`, since a mod can't import
from another mod's folder. A test fails when the copies differ.

The same file holds the sidebar grid. `GRID` and `MENU` set row heights, paddings,
gaps and slot sizes. `gridRow`, `statusSlot` and `projectIconView` draw the rows of
both lists, so icons, names, counts and status glyphs line up across the sidebar.
Every row ends with its status slot, and a count or time sits just before it.
`.config/herdr-app/tests/herdr-sidebar-grid.test.mjs` renders both lists and compares their rows.

## Machines

The `machines` mod draws the sidebar footer in the `bjorn` layout: a row per
machine with its status, Add machine, a divider, then Settings. This computer
comes first. A dot
shows whether each machine is ready, needs a login, is connecting or is out of
reach. A click on another machine opens its menu: Log in (in a terminal here, since it
asks for a password or code), Update herdr-core, Rename and Forget.
The footer resizes its layout block to fit its rows.

## Sessions

The bottom bar shows the agent in view's times: Active (since its last
activity), Session (its length, idle time included) and Updated (its last
report). The agents list works them out and shares them as `agents.times`.

Agents publish labels through `python3 "$HOME/scripts/herdr-context" label`:

- Summaries: `summary.goal`, `summary.activity`, `summary.updated` (Unix seconds).
- Titles: `session.title`, `session.title.updated` (Unix seconds).

Labels are optional but preferred. Every 30 seconds the agents list reads the tail
of each Claude Code and Codex transcript, with no model and no tokens. Activity
comes from the agent's own report while it covers the latest conversation. Without
one, it shows the live transcript: the running tool action during a turn ("Running
node --test", "Editing main.js"), else the latest assistant sentence. A dim
"Live · 12s ago" marks it, and the activity timer counts from that action. Then
come the newest recap, status message, or older report. Phrases drop environment
assignments and anything after a token or password flag. Orange marks only a failed
transcript check.

The goal comes from the agent's report, then the session title (the agent's label,
its terminal title, or the tab name), then a recap, then the first line of the
first prompt.

Names follow one order in agent rows, helper names and tab titles: Claude Code's
`/rename` name, the agent's `session.title` label, the recap's title, then the
goal and the terminal title. `tab-titles` reads recap titles from the agent list's
shared observations and never renames a tab the person named.

Recaps start disabled. Turn them on from any agent's right-click menu to send a short excerpt to the
smallest model of the session's provider: Claude Haiku or Codex's `gpt-6-luna`.
The excerpt holds the first prompt and the last eight messages, with tool calls as
one-line phrases, at most 4000 characters. One call returns a goal, an activity
and, when the session has no `/rename` name or `session.title` label, a title.
Recaps run only for a missing goal or title of an agent in the tab in view, and
never resume or fork the conversation. Requests wait at least two minutes after a
report, three minutes between launches, and fifteen minutes between attempts for
one session. Each request has a two-minute timeout. Recaps stay in a private cache
on the session's machine. Unsupported or ambiguous sessions show unavailable
freshness instead of guessed summaries.

Right-click an agent and pick Move to machine to carry it to another connected
machine. Only an idle or done agent moves; a working or blocked one gets a toast
and stays. The move commits every change as "WIP: moved to <machine>" (files over
20 MB stay behind) and pushes the branch without force. On the target it checks
the branch out in `~/.herdr/worktrees/<owner>/<repo>/<branch>`, from the
project's folder there or a clone in `~/.herdr/repos/<owner>/<repo>`. It copies
the Claude Code or Codex conversation with the old checkout's paths rewritten and
resumes it in a new tab with the same project. The source pane closes last, so a
failed step leaves the agent running where it was. `agent-list/move.js` holds the
plan and the steps.

Session length uses the foreground process age from `ps` and includes idle time.
The bottom bar leaves out a time it doesn't know. Existing Codex processes keep
their old routing until the user resumes them.

Manual tab names take precedence. Clear a name to restore automatic titles.
Temporary status titles such as "Action Required" are rejected.

Quota details open on hover.
