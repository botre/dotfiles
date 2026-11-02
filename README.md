# Dotfiles

Personal dotfiles managed with [yadm](https://yadm.io/).

```sh
yadm clone --bootstrap https://github.com/botre/dotfiles.git
```

The bootstrap runs the setup scripts in `scripts/` that fit the machine. Run
`yadm bootstrap` to repeat it, or run one script on its own from your home
directory.

`scripts/agents` rewrites the live Claude Code, OpenCode and Codex configs. To
try a change without touching them, point `CLAUDE_CONFIG_DIR`,
`XDG_CONFIG_HOME` and `CODEX_HOME` at empty directories.
