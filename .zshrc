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
alias dockerfresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias omzsh='vi ~/.oh-my-zsh'
alias rmdsstore='find . -name '.DS_Store' -type f -print -delete'
alias rmemptydir='find . -type d -empty -print -delete'
alias rmnodemodules='find . -name 'node_modules' -type d -print -prune -exec rm -rf '{}' +'
alias zshconfig='vi ~/.zshrc'