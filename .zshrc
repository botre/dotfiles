path+=("/usr/local/sbin")
path+=("$HOME/.cargo/bin")
export PATH

export ZSH="$HOME/.oh-my-zsh"

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

ZSH_THEME="robbyrussell"

export VISUAL=nvim
export EDITOR="$VISUAL"

VI_MODE_SET_CURSOR=true

plugins=(
  asdf
  aws
  brew
  docker
  gh
  git
  node
  npm
  terraform
  vi-mode
  fzf # must be after vi-mode
  yarn
)

source $ZSH/oh-my-zsh.sh

# FZF theme (Dracula)
export FZF_DEFAULT_OPTS='--color=fg:#f8f8f2,bg:#282a36,hl:#bd93f9 --color=fg+:#f8f8f2,bg+:#44475a,hl+:#bd93f9 --color=info:#ffb86c,prompt:#50fa7b,pointer:#ff79c6 --color=marker:#ff79c6,spinner:#ffb86c,header:#6272a4'

alias vi="nvim"
alias vim="nvim"

alias idea='open -na "IntelliJ IDEA.app"'

alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'

alias dofresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias docupd='docker compose up -d'