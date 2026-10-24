# Dotfiles

Personal dotfiles managed with [yadm](https://yadm.io/).

```sh
yadm clone https://github.com/botre/dotfiles.git
```

From your home directory, run the setup steps for your machine in this order:

- `scripts/mac-settings` and `scripts/mac-applications`: macOS setup
- `scripts/arch-applications`: Arch packages
- `scripts/gnome` and `scripts/openwhispr`: GNOME setup
- `scripts/fonts`: Hack Nerd Font
- `scripts/zsh`: Zsh and Oh My Zsh
- `mise install`: development tools
- `scripts/agents`: MCP servers, permissions and Herdr integrations
- `scripts/skills`: skills from `skills.txt`
