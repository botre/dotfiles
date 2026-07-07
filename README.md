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

## arch-applications

`scripts/arch-applications` reads `arch-packages.txt` and installs every listed package with `yay` (installing `yay` itself first if it's missing). Add or remove a line to change what gets installed on the next run.

## Version control & terminal tooling

- **jujutsu (`jj`)** — Git-compatible VCS configured for colocated mode (`jj` and `git` share one working copy). Config in `.config/jj/config.toml`; installed via `arch-packages.txt`.
- **hunk** — review-first terminal diff viewer that auto-detects git/jj. Config in `.config/hunk/config.toml`; installed via mise (`npm:hunkdiff` in `.config/mise/config.toml`), as it has no Arch package.
- **herdr** — tmux-style multiplexer for agents, prefix rebound to `Ctrl-a` to match `.tmux.conf`. Config in `.config/herdr/config.toml`; installed via `arch-packages.txt` (`herdr-bin`).
