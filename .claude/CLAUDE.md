# Global agent context

Applies to every repository. Repo-specific conventions belong in that repo's
`AGENTS.md`, not here.

## Git

- Never `git commit --amend` in a `--depth 1` shallow clone. The tip commit's parent is
  grafted away, so the amend produces an **orphaned root commit**; force-pushing it
  disconnects the branch from its base, GitHub reports "No common ancestor", and the PR
  diff balloons to the entire repository. To amend an already-pushed branch, work in a
  full clone (or `git fetch origin <branch>` into one) and amend there.
- Recovering a branch already orphaned this way: full-clone, `git checkout -B <branch>
  origin/<base>`, `git checkout <orphan-ref> -- <files>`, recommit, force-push. Reopening
  the closed PR may be refused — open a fresh one from the corrected branch.
