export PATH="/usr/local/sbin:$PATH"
export ZSH="/Users/bjorn/.oh-my-zsh"

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

alias vi="nvim"
alias vim="nvim"

alias awsconfig='vi ~/.aws/config'
alias awscredentials='vi ~/.aws/credentials'

alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'

alias dofresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias docupd='docker compose up -d'

alias zshconfig='vi ~/.zshrc'
alias zshsource='source ~/.zshrc'