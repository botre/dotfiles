#!/usr/bin/env bash

# This is not a substitute for creating a .gitignore file in each project.
# It is merely a safeguard against accidentally committing files that should not be.

# Check if Git is installed
if ! command -v git &>/dev/null; then
  echo "Git is not installed. Please install Git and try again."
  exit 1
fi

FILE="$HOME/.gitignore_global"
PATTERNS=(
  ".DS_Store"
  ".idea"
  "node_modules"
)

touch "$FILE"
true >"$FILE"

for pattern in "${PATTERNS[@]}"; do
  echo "$pattern" >>"$FILE"
done

# Add the global gitignore file to git config
git config --global core.excludesfile "$FILE"

echo "Global .gitignore file created at $FILE."
