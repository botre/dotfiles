# dotfiles

Personal dotfiles, managed with [yadm](https://yadm.io/).

## yadm

yadm is `git` with `$HOME` as the work tree, so the dotfiles here (`.zshrc`, `.config/*` and the rest) live directly in `$HOME`, next to the scripts and package lists. Changes are made in a regular clone of this repo, then `yadm pull` brings them into `$HOME`. `.gitconfig` rebases on pull, and a rebase will not start while any tracked file has local changes, which `.claude/settings.json` always has once herdr adds its hook. After cloning, run `yadm gitconfig pull.rebase false` and `yadm gitconfig pull.ff only` so yadm fast-forwards instead. A pull whose commits change `.claude/settings.json` still stops while that file has local changes, so stash it first.

## Scripts

Run them on a fresh machine, in this order:

- `scripts/mac-settings` (macOS only): applies macOS system settings
- `scripts/mac-applications` (macOS only): installs apps with Homebrew from `Brewfile`
- `scripts/arch-applications` (Arch only): installs packages with `yay` from `arch-packages.txt`
- `scripts/gnome` (Arch only): applies GNOME settings
- `scripts/openwhispr` (Arch only): sets up what OpenWhispr needs on GNOME to paste and to offer Hold mode
- `scripts/fonts`: installs Hack Nerd Font
- `scripts/zsh`: makes zsh the login shell and installs Oh My Zsh
- `mise install`: installs the tools in `.config/mise/config.toml`, including the `skills` CLI that `scripts/skills` needs
- `scripts/agents`: registers MCP servers with Claude Code and OpenCode, and installs their herdr integrations
- `scripts/skills`: installs agent skills from `skills.txt`

## mac-settings

`scripts/mac-settings` sets macOS defaults: software updates, time zone, firewall, screen lock and privacy, plus Dock, Finder, animation and input preferences. It needs `sudo`, and some settings apply only after logging out.

## mac-applications

`scripts/mac-applications` installs Homebrew if it is missing, then runs `brew bundle` on `Brewfile`. Deleting a line from `Brewfile` does not uninstall anything.

## arch-applications

`scripts/arch-applications` installs `yay` if it is missing and upgrades the whole system. It then installs every package in `arch-packages.txt`, marks them as explicitly installed, and removes orphaned dependencies. Deleting a line does not uninstall the package.

## gnome

`scripts/gnome` sets GNOME defaults with `gsettings`: time zone, privacy, screen lock, clock, input devices, animations, workspaces, sounds and window focus.

## openwhispr

`scripts/openwhispr` adds the user to the `input` group with `sudo` and enables the `ydotool` user service. The service starts at once if `/dev/uinput` is writable, and otherwise at the next login. The script also writes a hidden `open-whispr.desktop` to `~/.local/share/applications`, unless the package ships one.

## fonts

`scripts/fonts` downloads Hack Nerd Font into `~/Library/Fonts` on macOS or `~/.local/share/fonts` on Linux.

## zsh

`scripts/zsh` makes zsh the login shell with `chsh` and installs Oh My Zsh.

## agents

`scripts/agents` registers the MCP servers it declares with Claude Code and OpenCode, whichever are installed (figma goes to Claude Code only, because Figma rejects OpenCode), and installs herdr's integration for each. It also stops OpenCode from loading Claude Code's skills. Re-running it is safe.

`.agents/AGENTS.md` holds the global instructions Claude Code and OpenCode read. `.claude/CLAUDE.md` and `.config/opencode/AGENTS.md` are symlinks to it.

## skills

`scripts/skills` installs every source in `skills.txt` with the `skills` CLI, taking every skill each source offers. The skills land in `~/.agents/skills`, which yadm leaves untracked. Deleting a line does not uninstall its skills.
