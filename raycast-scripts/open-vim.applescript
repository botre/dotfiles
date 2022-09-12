#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open Vim
# @raycast.mode compact

# Optional parameters:
# @raycast.icon ✍️

# Documentation:
# @raycast.description Open Vim

tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "vim -c 'startinsert'"
  end tell
end tell
