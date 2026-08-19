# Global agent context

Applies to every repository. Repo-specific conventions belong in that repo's
`AGENTS.md`, not here.

## Commits & PRs

- Never attribute anything to Claude in a commit or a PR. That covers, at minimum: a
  `Co-Authored-By: Claude` trailer, a `Claude-Session:` trailer, a "Generated with Claude
  Code" footer, and a bare `https://claude.ai/code/session_…` link in a PR body — and any
  future variant of the same idea. Commit messages and PR bodies end with their own content.
- `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` together with
  `includeCoAuthoredBy: false` in `~/.claude/settings.json` enforces this. `commit` and `pr`
  hide the commit trailer and the PR footer; `sessionUrl` is what suppresses the
  `Claude-Session:` trailer and the session link in PR bodies, and it defaults to on for
  Remote Control and web sessions. `includeCoAuthoredBy` is deprecated but still load-bearing:
  one PR-body path treats an empty `pr` as unset and only that key silences it there.
- The preference stands on its own — keep this rule even where those settings are absent, and
  do not treat their presence as a reason to drop it.

## Git

- Never `git commit --amend` in a `--depth 1` shallow clone. The tip commit's parent is
  grafted away, so the amend produces an **orphaned root commit**; force-pushing it
  disconnects the branch from its base, GitHub reports "No common ancestor", and the PR
  diff balloons to the entire repository. To amend an already-pushed branch, work in a
  full clone (or `git fetch origin <branch>` into one) and amend there.
- Recovering a branch already orphaned this way: full-clone, `git checkout -B <branch>
  origin/<base>`, `git checkout <orphan-ref> -- <files>`, recommit, force-push. Reopening
  the closed PR may be refused — open a fresh one from the corrected branch.
