# Computer setup

## Mac

### Configuration

* Sign in with Apple ID
* Change user picture
* Delete widgets
* Enable automatic software updates
* Turn on "Firewall"
* Turn on "FileVault"
* Turn off "Remote Login"
* Disable "Play sound on startup"
* Disable "Show recent applications in dock"
* Disable "Hot Corners"
* Set "Minimise windows using" to "Scale effect"
* Enable "Show Bluetooth in menu bar"git
* Enable "Show Sound in menu bar"
* Enable "Finder > View > Show Path Bar"
* Enable "Finder > View > Show Status Bar"
* Set "Scroll direction" to "Natural"
* Set "Show scroll bars" to "Always"
* Change default browser to Google Chrome
* Change default shell to Zsh
* Create "Development" directory in user directory and add it to favorites
* Set "Development" as default directory for iTerm

### Applications

First, install Homebrew and XCode.

Then, use Homebrew to install:

* 1Password
* AWS CLI
* Discord
* Docker
* Freedom
* fzf
* Git
* GitHub CLI
* Google Chrome
* Google Drive
* GPG Suite
* IntelliJ
* iTerm2
* jq
* n
* Oh My Zsh
* Rectangle
* Slack
* Sops
* tfenv
* Transmission
* Visual Studio Code
* VLC
* Yarn
* Zsh

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

* Run `aws configure`

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
* Point shell path to Zsh
* Set "Open project in" to "New window"
* Help > Change Memory Settings > 4096 MiB

## iTerm2

* Disable "Preferences > General > Confirm Quit iTerm2"

## NPM

Global packages:

* http-server
* npm-check-updates

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

alias awsconfig="code ~/.aws/config"
alias awscredentials="code ~/.aws/credentials"
alias brewup="brew update; brew upgrade; brew cleanup; brew doctor"
alias omzshconfig="code ~/.oh-my-zsh"
alias zshconfig="code ~/.zshrc"
```