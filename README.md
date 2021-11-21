# Computer setup

## Mac

### Configuration

* Sign in with Apple ID
* Change user picture
* Turn on firewall
* Disable "Play sound on startup"
* Disable "Show recent applications in dock"
* Enable "Show Bluetooth in menu bar"
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

First, install Homebrew.

Then, use Homebrew to install:

* 1Password
* AWS CLI
* Docker
* Discord
* Freedom
* fzf
* Git
* GitHub CLI
* Google Chrome
* Google Drive
* IntelliJ
* iTerm2
* jq
* Oh My Zsh
* n
* Slack
* tfenv
* Visual Studio Code
* Yarn
* Zsh

### Startup applications

* 1Password
* Docker
* Freedom
* Google Drive

## IntelliJ

* Sign in with JetBrains account
* Enable "IDE Settings Sync"
    * Enable "Sync Plugins Silently"
    * Enable "Get Settings from Account"
* Point shell path to Zsh

## Zsh

.zshrc

```bash
export ZSH="/Users/bjorn/.oh-my-zsh"

ZSH_THEME="robbyrussell"

plugins=(aws docker fzf gh git node npm terraform yarn)

source $ZSH/oh-my-zsh.sh

alias zshconfig="code ~/.zshrc"
alias ohmyzsh="code ~/.oh-my-zsh"
alias brewup="brew update; brew upgrade; brew cleanup; brew doctor"
```