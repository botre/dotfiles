# Computer setup

## Mac

### Configuration

* Create "bjorn" user
* Change user picture
* Sign in with Apple ID
* Remove all widgets
* Enable automatic software updates
* Add device to "Find My"
* Add device serial number to password manager
* Turn on "Firewall"
* Require password "immediately" after sleep or screen saver begins
* Turn on "FileVault"
* Add "FileVault" key to password manager
* Turn off "Remote Login"
* Disable "Play sound on startup"
* Disable "Show recent applications in dock"
* Disable all "Hot Corners"
* Set "Minimise windows using" to "Scale effect"
* Enable "Show Bluetooth in menu bar"
* Set "Show Sound in menu bar" to "always"
* Enable "Finder > View > Show Path Bar"
* Enable "Finder > View > Show Status Bar"
* Set "Scroll direction" to "Natural"
* Set "Show scroll bars" to "always"

### Applications

1. Install Homebrew
2. Install XCode
3. `brew bundle` the Brewfile
4. Install Oh My Zsh

### Startup applications

* 1Password
* Docker
* Freedom
* Google Drive
* Rectangle

### Windows keyboard mappings

* Control -> Command
* Command -> Control

## AWS

* Import `config` and `credentials` files from password manager

## Git

* Global configurations

```bash
git config --global user.name "botre"
git config --global user.email "git@bjornkrols.com"
git config --global pull.rebase true
git config --global fetch.prune true
git config --global core.editor nano
git config --global diff.colorMoved zebra
```

* Create machine-specific GitHub personal access token
* Authorize GitHub CLI

## IntelliJ

* Sign in with JetBrains account
* Enable "IDE Settings Sync"
    * Enable "Sync Plugins Silently"
    * Enable "Get Settings from Account"
* Help > Change Memory Settings > 8192 MiB

## iTerm2

* Disable "Preferences > General > Confirm Quit iTerm2"

## NPM

Global packages:

```bash
npm install -g degit
npm install -g eas-cli
npm install -g http-server
npm install -g npm-check-updates
```

## SSH

```bash
ssh-keygen -t rsa -b 4096 -C "bjorn@system-identifier"
```

## Xcode

- Accept License Agreement
- Configure Locations > Command Line Tools

## VST plugins

* Bitspeek
* KORG Collection
* Sylenth1
* Voxengo SPAN

## Zsh

.zshrc

```bash
export PATH="/usr/local/sbin:$PATH"
export ZSH="/Users/bjorn/.oh-my-zsh"

ZSH_THEME="robbyrussell"

plugins=(
  aws
  brew
  docker
  fzf
  gh
  git
  node
  npm
  terraform
  vscode
  yarn
)

source $ZSH/oh-my-zsh.sh

alias awsconfig='code ~/.aws/config'
alias awscredentials='code ~/.aws/credentials'
alias brewup='brew update; brew upgrade; brew cleanup; brew doctor'
alias dockerfresh='docker kill $(docker ps -q); docker system prune --volumes --force'
alias omzsh='code ~/.oh-my-zsh'
alias zshconfig='code ~/.zshrc'
```

