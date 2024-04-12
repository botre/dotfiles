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

# FZF theme (Catppuccin Macchiato)
export FZF_DEFAULT_OPTS=" \
--color=bg+:#363a4f,bg:#24273a,spinner:#f4dbd6,hl:#ed8796 \
--color=fg:#cad3f5,header:#ed8796,info:#c6a0f6,pointer:#f4dbd6 \
--color=marker:#f4dbd6,fg+:#cad3f5,prompt:#c6a0f6,hl+:#ed8796"

alias tx="tmux"
alias txr="tmuxinator"

alias vi="nvim"
alias vim="nvim"

alias cat="bat"
alias ls="eza --icons"

alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'
alias brewupcask='brew update; brew upgrade --cask --greedy; brew cleanup; brew doctor'

alias dofresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias docupd='docker compose up -d'

alias ip='curl ipv4.icanhazip.com'

eval "$(starship init zsh)"
eval "$(zoxide init zsh --cmd cd)"
# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('/opt/homebrew/Caskroom/miniforge/base/bin/conda' 'shell.zsh' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh" ]; then
        . "/opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh"
    else
        export PATH="/opt/homebrew/Caskroom/miniforge/base/bin:$PATH"
    fi
fi
unset __conda_setup
# <<< conda initialize <<<

