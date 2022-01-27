# Computer setup

## Mac

### Configuration

* Change computer name
* Create "bjorn" user
* Change user picture
* Sign in with Apple ID
* Remove all widgets
* Enable automatic software updates
* Enable "Touch ID"
* Add device to "Find My"
* Disable "Share Mac Analytics"
* Add device serial number to password manager
* Turn on "Firewall"
* Require password "immediately" after sleep or screen saver begins
* Turn on "FileVault"
* Add "FileVault" key to password manager
* Turn off "Remote Login"
* Disable "Play sound on startup"
* Disable "Show recent applications in dock"
* Clear dock
* Disable all "Hot Corners"
* Set "Minimise windows using" to "Scale effect"
* Enable "Show Bluetooth in menu bar"
* Set "Show Sound in menu bar" to "always"
* Enable "Finder > View > Show Path Bar"
* Enable "Finder > View > Show Status Bar"
* Set "Scroll direction" to "Natural"
* Set "Show scroll bars" to "always"
* Disable "Ask Siri"
* Enable "Allow Handoff between this Mac and your iCloud devices"
* Set default web browser to "Google Chrome"

### Applications

1. Install Homebrew
2. Install XCode
3. `brew bundle` the `Brewfile`
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

### Cleanup

* Remove device from "Find My"
* Remove device from "Freedom"
* Revoke machine-specific GitHub personal access token

## asdf

```bash
asdf plugin add nodejs
asdf install nodejs latest
asdf global nodejs latest

asdf plugin-add terraform https://github.com/asdf-community/asdf-hashicorp.git
asdf install terraform latest
asdf global terraform latest

asdf plugin add yarn
asdf install yarn latest
asdf global yarn latest
```

## AWS

* Import `config` and `credentials` files from password manager

## Git

* Import `.gitconfig`
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

