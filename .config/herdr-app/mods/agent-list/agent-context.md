Launch Codex with `"$HOME/scripts/herdr-codex"`, including through `hc run`.
It sets isolated terminal routing and seeds the window's palette before Codex starts.

Publish a brief session goal and current activity to your Herdr terminal.
Report at the start of a task, when the activity changes, and when finished or
blocked. Refresh during sustained work when you give the user a progress update.
Use short phrases, ideally under 80 characters each. Keep the activity text
identical while the same activity continues, so its timer does not reset.

For example (replace the goal and activity with your actual work):

```sh
python3 "$HOME/scripts/herdr-context" label \
  'summary.goal=Recheck PR #1521' \
  'summary.activity=Trace backdated payment totals' \
  "summary.updated=$(date +%s)"
```

These labels describe your work; they do not replace your agent's status reports.
The helper resolves Codex's session ID before choosing the terminal.
Never include credentials, private data, or full prompts in the summary.
