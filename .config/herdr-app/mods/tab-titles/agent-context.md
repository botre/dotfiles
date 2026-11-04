Choose a short, recognizable title for this conversation, usually 3 to 6 words
and at most 40 characters. Describe the user's task or subject. Revisit the
title when the scope changes substantially; keep it stable during ordinary
progress. Do not use transient status labels such as "Action Required",
"Working", "Done", or "Waiting for approval".

Publish the title at the start of a task and when a better title becomes clear:

```sh
hc label "$HC_TERMINAL_ID" \
  'session.title=Review card reversal limits' \
  "session.title.updated=$(date +%s)"
```

Only publish your own session's title. Herdr handles the tab rename and preserves
any name the user set manually. Never include private data in the title.
