if [[ -d /home/linuxbrew/.linuxbrew ]]; then
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

path+=("/usr/local/bin")
path+=("/usr/local/sbin")
export PATH

export ZSH="$HOME/.oh-my-zsh"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

export VISUAL=nvim
export EDITOR="$VISUAL"

VI_MODE_SET_CURSOR=true

plugins=(
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
alias dcupd='docker compose up -d'

alias g='git'

alias ip='curl ipv4.icanhazip.com'

alias ls='eza --icons'
alias lsa="ls -a"

alias lzd="lazydocker"
alias lzg="lazygit"

alias v="nvim"
alias vi="nvim"
alias vim="nvim"

eval "$(zoxide init zsh --cmd cd)"
eval "$(thefuck --alias)"
eval "$(starship init zsh)"

export GOPATH=$(go env GOPATH)
export PATH=$PATH:$(go env GOPATH)/bin
