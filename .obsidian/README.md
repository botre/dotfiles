# Obsidian

Default dotfiles for Obsidian vaults.

## Backup vault configuration

```bash
# Create destination directory
mkdir -p ~/Development/dotfiles/.obsidian

# Navigate to source directory
cd ~/Documents/Personal/.obsidian

# Copy files from root, excluding specified files
find . -maxdepth 1 -type f -not -name "workspace.json" -not -name "types.json" -exec cp {} ~/Development/dotfiles/.obsidian/ \;

# Copy directories, excluding themes and plugins
find . -maxdepth 1 -type d -not -name "." -not -name "themes" -not -name "plugins" -exec cp -r {} ~/Development/dotfiles/.obsidian/ \;

# Setup plugins directory
mkdir -p ~/Development/dotfiles/.obsidian/plugins

# Copy plugin directories
find plugins -maxdepth 1 -type d -not -name "plugins" -exec cp -r {} ~/Development/dotfiles/.obsidian/plugins/ \;

# Retain only data.json files in plugins
find ~/Development/dotfiles/.obsidian/plugins -type f -not -name "data.json" -delete

# Remove sensitive information from data.json files
find ~/Development/dotfiles/.obsidian/plugins -name "data.json" -exec sh -c '
  if jq -e "has(\"apiKey\") or has(\"apikey\") or has(\"password\") or has(\"username\") or has(\"userName\")" "{}" > /dev/null 2>&1; then
    jq "del(.apiKey) | del(.apikey) | del(.password) | del(.username) | del(.userName)" "{}" > "{}.tmp" && mv "{}.tmp" "{}"
  fi
' \;

# Clean up empty directories
find ~/Development/dotfiles/.obsidian/plugins -type d -empty -delete
```

## Services with API keys

These require an extra manual configuration step:

- LanguageTool