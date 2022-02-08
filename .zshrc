export PATH="/usr/local/sbin:$PATH"
export ZSH="/Users/bjorn/.oh-my-zsh"

ZSH_THEME="robbyrussell"

plugins=(
  asdf
  aws
  brew
  docker
  fzf
  gh
  git
  node
  npm
  terraform
  yarn
)

source $ZSH/oh-my-zsh.sh

alias awsconfig='vi ~/.aws/config'
alias awscredentials='vi ~/.aws/credentials'
alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'
alias dofresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias docupd='docker compose up -d'
alias omzsh='vi ~/.oh-my-zsh'
alias zshconfig='vi ~/.zshrc'