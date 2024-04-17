path+=("/usr/local/bin")
path+=("/usr/local/sbin")
path+=("$HOME/miniforge3/bin")
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

alias v='fzf --preview "bat --color \"always\" {}"'

alias cat="bat"
alias ls="eza --icons"

alias tx="tmux"
alias txr="tmuxinator"

alias vi="nvim"
alias vim="nvim"

alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'
alias brewcup='brew update; brew upgrade --cask --greedy; brew cleanup; brew doctor'

alias dofresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias docupd='docker compose up -d'

alias ip='curl ipv4.icanhazip.com'

function git-clean-branches () {
    # Auto-detect whether to use main/master
    local DEFAULT_BRANCH=$(git branch | grep -Ew "main|master" | sed "s/\* //")

    # Just print the names
    # If you're on a branch that has been merged (has a "*"), don't print it
    git branch --merged $DEFAULT_BRANCH | grep -v "\*" | grep -Evw $DEFAULT_BRANCH

    echo "Use 'git-clean-branches | xargs git branch -d' to actually delete these." >&2
}

function notebook () {
    # Prompt for a name
    read -p "Enter project name: " project_name

    # Create a directory with the entered name
    mkdir "$project_name"
    cd "$project_name"

    # Create a Conda environment with the entered name
    conda create -y -n "$project_name" python

    # Activate the Conda environment
    source activate "$project_name"

    # Install Jupyter
    conda install -y jupyter

    ## Create an empty Notebook
    echo '{
     "cells": [],
     "metadata": {},
     "nbformat": 4,
     "nbformat_minor": 2
    }' > Notebook.ipynb

    # Open the Notebook
    jupyter notebook Notebook.ipynb
}

eval "$(starship init zsh)"
eval "$(zoxide init zsh --cmd cd)"