# dotfiles

Personal dotfiles, managed with [yadm](https://yadm.io/).

## yadm

This repo is the underlying repo for [yadm](https://yadm.io/). yadm wraps `git` with `$HOME` as the work tree, so dotfiles (`.zshrc`, `.vimrc`, `.config/*`, etc.) live directly in `$HOME` alongside the bootstrap scripts and package lists in this repo. Sync with `yadm pull`; track new changes with `yadm status` / `yadm add` / `yadm commit` / `yadm push`.

## Scripts

Bootstrap scripts for a fresh machine. The order of execution matters:

- `scripts/mac-settings` (macOS only) — applies macOS system defaults
- `scripts/mac-applications` (macOS only) — installs apps via Homebrew using `Brewfile`
- `scripts/arch-applications` (Arch only) — installs apps via `yay` using `arch-packages.txt`
- `scripts/gnome` (Arch only) — applies GNOME settings
- `scripts/fonts` — installs fonts
- `scripts/zsh` — sets zsh as the default shell and installs plugins
- `scripts/claude` — registers Claude Code MCP servers
- `scripts/skills`: installs agent skills with the `skills` CLI using `skills.txt`

## mac-settings

`scripts/mac-settings` (macOS only) applies system defaults with `defaults write` and `systemsetup`: automatic updates, automatic time zone, firewall on, and analytics sharing off. It needs `sudo`.

## mac-applications

`scripts/mac-applications` (macOS only) installs Homebrew if it is missing, then runs `brew bundle` against `Brewfile`. Add or remove a line in `Brewfile` to change what gets installed.

## arch-applications

`scripts/arch-applications` reads `arch-packages.txt` and installs every listed package with `yay` (installing `yay` itself first if it's missing). Add or remove a line to change what gets installed on the next run.

## gnome

`scripts/gnome` (Arch only) applies desktop settings with `gsettings`: automatic time zone, usage-data collection off, immediate lock after sleep, permanent scroll bars, and a 24-hour clock.

## fonts

`scripts/fonts` downloads Hack Nerd Font and installs it to the right per-OS directory, `~/Library/Fonts` on macOS and `~/.local/share/fonts` on Linux.

## zsh

`scripts/zsh` sets zsh as the login shell with `chsh` and installs Oh My Zsh.

## claude

`scripts/claude` registers Claude Code MCP servers. They live in `~/.claude.json`, which also holds machine-local state and is therefore not tracked here. Every server is removed before it is re-added, so re-running converges.

## skills

`scripts/skills` reads `skills.txt` and installs every listed source with the `skills` CLI, taking every skill that source offers. Add or remove a line to change what gets installed on the next run.

The sources are a list rather than a single repo on purpose. Most skills come from `botre/skills`, but some come from elsewhere, and a reinstall that pulls only the one repo drops the others silently.

Skills install into `~/.agents/skills` as copies, with each agent directory holding symlinks into that tree, so none of them can be tracked in this repo directly.
