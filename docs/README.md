## Theme

I am all in on Catppuccin Latte, a light theme for all my apps.

I find that having a consistent theme and syntax highlighting across my main applications helps reduce cognitive load.

Light themes translate well to print and work better with white-background images.

## Font

I use Hack, a typeface designed for source code, specifically a Nerd Font variant that includes icons for terminal applications.

I use monospaced fonts for both coding and note-taking.

## Terminal

My terminal of choice is Ghostty - fast, feature-rich, cross-platform with native UI and GPU acceleration.

## Shell

I use Zsh as my shell.

It is something I carry over from my Mac setup, and I find it to be a great shell.

I have never used Fish, but I have heard good things about it.

I am using Oh My Zsh for plugins and themes, it is low-overhead and there are a lot of plugins available.

Vim keybindings to navigate the command line are a must; in my current setup it is enabled via the `vi-mode` plugin.

The prompt is minimal with a few key pieces of information, powered by `starship`.

## Programming language runtimes

For programming language runtimes, I use mise to manage installations.

Exceptions are Go (the default toolchain works great) and Python (mostly using uv).

My approach is installing LTS versions globally with per-project overrides.

I like the idea of dev containers or Nix for managing runtimes, something I want to explore in the future.

## Communication

I use Beeper as a unified chat app. I highly recommend it.

I also use the native Slack app, because it is my main work communication tool.

## Alt + Tab

I really like Alt + Tab for switching between applications.

On Mac, I used `AltTab`, and on Ubuntu this functionality is built-in.

## Application launcher

A single key to search and launch applications is essential.

I use GNOME's Super key search but would switch to Raycast instantly if it were ported from Mac.

## Browser

I'm not too adventurous when it comes to browsers.

I use Firefox as my main browser, occasionally switching to Chrome for development and testing.

## Containers

Docker is my go-to tool for containerization.

I also use `lazydocker` for an enhanced CLI experience.

I alias `d` to `docker`.
I alias `dc` to `docker compose`.
I alias `lzd` to `lazydocker`.

## Keybindings

I use Vim keybindings wherever possible - they are efficient and portable across applications.

## Obsidian

Obsidian is my main note-taking app.

## Spell checking

I use LanguageTool for spell checking - it supports multiple languages, and is available as browser extension and Obsidian plugin.

## Code editor

I primarily use JetBrains IDEs (IntelliJ, Android Studio, DataGrip), managed through their Toolbox application, while occasionally using Neovim for quick edits.

Vim motions and modal editing are essential.

I minimize JetBrains-specific keybindings, I prefer Vim or custom bindings ideally with Neovim equivalents maintained.

## Password manager

I use 1Password as my password manager.

## Media player

Spotify and VLC are my go-to media players.

## Git

I use Git for version control.

I also use `lazygit` for an enhanced CLI experience.

I alias `g` to `git`.
I alias `lzg` to `lazygit`.

I have a couple of Git aliases that I find useful.

## Git aliases

| Alias    | Command                     | Description                                             |
|----------|-----------------------------|---------------------------------------------------------|
| `a`      | `add`                       | Add file contents to the index                          |
| `alias`  | `config --get-regexp alias` | List all configured aliases                             |
| `amend`  | `commit --amend`            | Amend the previous commit                               |
| `c`      | `commit`                    | Commit                                                  |
| `cm`     | `commit -m`                 | Commit with message                                     |
| `co`     | `checkout`                  | Checkout a branch                                       |
| `cob`    | `checkout -b`               | Create and checkout a new branch                        |
| `cp`     | `cherry-pick`               | Cherry-pick changes from other commits                  |
| `last`   | `log -1 HEAD`               | Show the latest commit                                  |
| `p`      | `push`                      | Push changes                                            |
| `pl`     | `pull`                      | Pull changes                                            |
| `recent` | Custom command              | Lists branches sorted by commit date with formatting    |
| `rh`     | `reset --hard`              | Reset current HEAD to specified state (discard changes) |
| `s`      | `status`                    | Show working tree status                                |