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
- `scripts/hyprland-applications` (Arch only) — installs the Hyprland desktop via `yay` using `hyprland-packages.txt`
- `scripts/hyprland` (Arch only) — applies GTK-app settings for a Hyprland session
- `scripts/fonts` — installs fonts
- `scripts/zsh` — sets zsh as the default shell and installs plugins

## arch-applications

`scripts/arch-applications` reads `arch-packages.txt` and installs every listed package with `yay` (installing `yay` itself first if it's missing). Add or remove a line to change what gets installed on the next run.

## Hyprland

A Hyprland desktop is provided as an alternative to GNOME — both can be installed at once and chosen at the GDM login screen.

- `scripts/hyprland-applications` reads `hyprland-packages.txt` and installs a minimal Wayland stack (Hyprland, waybar, fuzzel, mako, hyprlock/hypridle, screenshot and clipboard tools).
- `scripts/hyprland` applies the handful of `gsettings` that still affect GTK apps without GNOME Shell. Everything else — keybinds, input, animations — lives in `.config/hypr/hyprland.lua`.

The compositor config uses the Lua format ([Hyprland ≥ 0.55](https://hypr.land/news/26_lua/)); `hyprlock` and `hypridle` keep their own `hyprlang`-style `.conf` files. Settings mirror `scripts/gnome` where an equivalent exists.
