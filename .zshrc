path+=("/usr/local/bin")
path+=("/usr/local/sbin")
path+=("$HOME/.local/bin")
export PATH

export ZSH="$HOME/.oh-my-zsh"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

export VISUAL=nvim
export EDITOR="$VISUAL"

VI_MODE_SET_CURSOR=true

plugins=(
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

if [[ "$(uname)" == "Darwin" ]]; then
    alias copy='pbcopy'
else
    alias copy='xclip -sel clip'
fi

alias d='docker'
alias dfresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias dc='docker compose'
alias dcupd='docker compose up -d'

alias g='git'

alias ip='curl ipv4.icanhazip.com'

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

eval "$(zoxide init zsh --cmd cd)"
eval "$(thefuck --alias)"
eval "$(starship init zsh)"

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
