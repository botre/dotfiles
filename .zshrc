path+=("/usr/local/bin")
path+=("/usr/local/sbin")
path+=("$HOME/.local/bin")
export PATH

export ZSH="$HOME/.oh-my-zsh"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

export VISUAL=nvim
export EDITOR="$VISUAL"

export SSH_AUTH_SOCK=~/.1password/agent.sock

VI_MODE_SET_CURSOR=true

plugins=(
  1password
  archlinux
  aws
  brew
  docker
  gcloud
  gh
  git
  git-lfs
  golang
  mise
  node
  npm
  react-native
  ssh
  systemd
  terraform
  vi-mode
  fzf # must be after vi-mode
  yarn
)

source $ZSH/oh-my-zsh.sh

# FZF theme (Catppuccin Latte)
export FZF_DEFAULT_OPTS=" \
--color=bg+:#ccd0da,bg:#eff1f5,spinner:#dc8a78,hl:#d20f39 \
--color=fg:#4c4f69,header:#d20f39,info:#8839ef,pointer:#dc8a78 \
--color=marker:#dc8a78,fg+:#4c4f69,prompt:#8839ef,hl+:#d20f39"

alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'

alias cat="bat"

# Clipboard copy, detecting the platform
if [[ "$(uname)" == "Darwin" ]]; then
    alias copy='pbcopy'
elif [[ -n "$WAYLAND_DISPLAY" ]]; then
    alias copy='wl-copy'
else
    alias copy='xclip -sel clip'
fi

alias d='docker'
alias dfresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias dc='docker compose'
alias dcupd='docker compose up -d'

alias g='git'

alias j='jj'

alias ip='curl ipv4.icanhazip.com'

# Auto-detect package manager from lockfile
p() {
  if   [[ -f bun.lockb || -f bun.lock ]]; then cmd=bun
  elif [[ -f pnpm-lock.yaml ]]; then cmd=pnpm
  elif [[ -f yarn.lock ]]; then cmd=yarn
  else cmd=npm
  fi
  echo "→ $cmd $@"
  $cmd "$@"
}

alias ls='eza --icons'
alias lsa="ls -a"

alias lzd="lazydocker"
alias lzg="lazygit"

# Start nvim with RPC server enabled. This allows external tools (like lazygit)
# to open files in the same nvim instance using --remote-tab
alias nvim="nvim --listen /tmp/nvim-server.pipe"
alias v="nvim"
alias vi="nvim"
alias vim="nvim"

# Wrapper that provides the ability to change the current working directory when exiting Yazi
function yaz() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
	rm -f -- "$tmp"
}

# Go development
export GOPATH=$(go env GOPATH)
export PATH=$PATH:$(go env GOPATH)/bin

# Java development
export JAVA_HOME=/usr/lib/jvm/default
export PATH=$JAVA_HOME/bin:$PATH

# Android development
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Shell tool integrations (order matters, zoxide must be last)
eval "$(pay-respects zsh --alias f)"
eval "$(starship init zsh)"
eval "$(zoxide init zsh --cmd cd)"

# Coding agents (Claude Code) snapshot this file's aliases and replay them for every tool
# call. Shadowing coreutils with prettifiers makes the agent fall back to `/bin/ls`, which
# the permission engine cannot match against its bare-name read-only allowlist, so every
# listing costs an approval prompt. Give agent shells the real tools; interactive is unchanged.
# Must stay last: it has to run after every alias definition above.
if [[ -n "$CLAUDECODE" ]]; then
  unalias ls lsa cat 2>/dev/null
fi
