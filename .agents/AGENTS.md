# Global agent context

Applies to every repository. Repo-specific conventions belong in that repo's
`AGENTS.md`, not here.

## Writing

- No em dashes in prose written for the user: UI copy, page titles and meta
  descriptions, code comments, commit messages, Markdown docs, or chat replies.
  Rewrite the clause rather than swapping the dash for a hyphen. A paired aside
  becomes commas or parentheses; a dash introducing an explanation becomes a
  colon or a new sentence.
- An em dash used as a data placeholder (a missing value in a table cell) is not
  prose and is fine to leave.

## Commits & PRs

- Never attribute anything to an AI agent (Claude, OpenCode, Codex, or any other) in a commit
  or a PR. That covers, at minimum: a `Co-Authored-By:` trailer naming an agent, a session
  trailer such as `Claude-Session:`, a "Generated with <agent>" footer, and a bare session link
  such as `https://claude.ai/code/session_…` in a PR body, and any future variant of the same
  idea. Commit messages and PR bodies end with their own content.
- In Claude Code, `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` together with
  `includeCoAuthoredBy: false` in `~/.claude/settings.json` enforces this. `commit` and `pr`
  hide the commit trailer and the PR footer; `sessionUrl` is what suppresses the
  `Claude-Session:` trailer and the session link in PR bodies, and it defaults to on for
  Remote Control and web sessions. `includeCoAuthoredBy` is deprecated but still load-bearing:
  one PR-body path treats an empty `pr` as unset and only that key silences it there.
- In Codex, `~/.codex/config.toml` has no key for this. Its `Co-authored-by: Codex` trailer
  and "Generated with Codex" PR footer come from a setting on the ChatGPT account
  (`commit_attribution_enabled`), so that setting must be off.
- The preference stands on its own: keep this rule even where those settings are absent, and
  do not treat their presence as a reason to drop it.

## PR descriptions

- Read the diff against the PR's base branch with `git diff <base>...HEAD` (often `master` or
  `development`, rarely `main`). Do not just rely on session context.
- Sentences: max 20 words. Active voice. Simple tenses only.
  No "-ing" verbs. Do not omit articles or subjects.
- One topic per paragraph, max 6 sentences. No headers, no bold.
- Paragraph 1: the problem, then what the PR does.
- Paragraph 2: limits, risks, and what the PR does not change.
- Paragraph 3: numbered test steps. One action per step.
- Do not describe what the reviewer can see in the diff.
- Max 150 words.

## PR review tone

- Be concise: one point per comment, with a short reason ("since…", "so that…").
- Be polite and collaborative: phrase changes as "Let's…" rather than imperatives.
  - ✅ "Let's move this check before the DB call, so we fail fast."
  - ❌ "Move this check before the DB call."
- When unsure, ask instead: "Could `user` be null here?"
- Only label comments when it matters: prefix `blocking:` for must-fix items and `nit:` for
  trivial ones. Everything else needs no label.
- Comment on the code, never the author. Avoid "you should", "just", "simply", "obviously",
  "why didn't you".
- Include a code suggestion when the fix is a few lines.
- No filler praise or apologies. A single genuine compliment is fine when earned.

## GitHub media

- To show a screenshot or video in an issue, PR, or comment, pass `--attach <file>` to
  `gh issue|pr create|edit|comment` (gh 2.99.0+). Do not commit the file to the repo.
- Unreferenced files go at the end of the body. To place one inline, write
  `![](./demo.mp4)` in the body and pass the same path to `--attach`. Image alt text
  follows `#`: `--attach './login.png#Login error state'`.
- If an upload fails, gh still creates the PR, issue, or comment and prints its URL, then
  exits non-zero. Check for that URL before retrying, or you create a duplicate.

## Git

- Never `git commit --amend` in a `--depth 1` shallow clone. The tip commit's parent is
  grafted away, so the amend produces an **orphaned root commit**; force-pushing it
  disconnects the branch from its base, GitHub reports "No common ancestor", and the PR
  diff balloons to the entire repository. To amend an already-pushed branch, work in a
  full clone (or `git fetch origin <branch>` into one) and amend there.
- Recovering a branch already orphaned this way: full-clone, `git checkout -B <branch>
  origin/<base>`, `git checkout <orphan-ref> -- <files>`, recommit, force-push. Reopening
  the closed PR may be refused; open a fresh one from the corrected branch.

## Browser

- For browsing, use the `chrome-devtools` MCP server. It starts its own Chrome with a
  throwaway profile, so it always works. That includes apps behind a login you can
  complete yourself, such as a local app with a seeded account or a simulated auth provider.
- Use `chrome-live` only when the task needs the user's own Chrome: a session you cannot
  create yourself (their accounts on real sites), their open tabs, or they say "my Chrome".
  It attaches to a Chrome already running with remote debugging on
  (`chrome://inspect/#remote-debugging`). If it cannot attach, ask the user to turn that
  on. Do not launch Chrome yourself: Chrome blocks remote debugging on the default profile.
