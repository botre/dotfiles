path+=("/usr/local/bin")
path+=("/usr/local/sbin")
export PATH

export ZSH="$HOME/.oh-my-zsh"

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

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

# FZF theme (Catppuccin Latte)
export FZF_DEFAULT_OPTS=" \
--color=bg+:#ccd0da,bg:#eff1f5,spinner:#dc8a78,hl:#d20f39 \
--color=fg:#4c4f69,header:#d20f39,info:#8839ef,pointer:#dc8a78 \
--color=marker:#dc8a78,fg+:#4c4f69,prompt:#8839ef,hl+:#d20f39"

alias v='fzf --preview "bat --color \"always\" {}"'

alias cat="bat"
alias ls="eza --icons"

alias vi="nvim"
alias vim="nvim"

alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'
alias brewcup='brew update; brew upgrade --cask --greedy; brew cleanup; brew doctor'

alias dofresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias docupd='docker compose up -d'

alias ip='curl ipv4.icanhazip.com'

# Print local branches that have been merged into main (or master).
function git-clean-branches () {
    # Auto-detect whether to use main/master.
    local DEFAULT_BRANCH=$(git branch | grep -Ew "main|master" | sed "s/\* //")

    # Just print the names.
    # If you're on a branch that has been merged (has a "*"), don't print it.
    git branch --merged $DEFAULT_BRANCH | grep -v "\*" | grep -Evw $DEFAULT_BRANCH

    echo "Use 'git-clean-branches | xargs git branch -d' to actually delete these." >&2
}

eval "$(zoxide init zsh --cmd cd)"
eval "$(thefuck --alias)"
eval "$(starship init zsh)"