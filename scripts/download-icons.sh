#!/bin/bash

# Download Lucide icons
ICONS_DIR="ui/icons"
mkdir -p "$ICONS_DIR"

# List of icons we need
ICONS=(
  "download"
  "clipboard-copy"
  "wand-2"
  "settings"
  "check"
  "x"
  "plus"
  "folder"
  "bot"
  "trash"
  "pencil"
  "search"
  "send"
  "save"
  "chevron-down"
  "chevron-up"
  "chevron-right"
  "chevron-left"
  "folder-open"
  "file"
  "copy"
  "refresh-cw"
  "alert-circle"
  "check-circle"
  "x-circle"
  "info"
  "help-circle"
  "external-link"
  "lock"
  "unlock"
  "eye"
  "eye-off"
  "code"
  "terminal"
  "globe"
  "zap"
  "clock"
  "user"
  "users"
  "git-branch"
  "git-commit"
  "merge"
  "play"
  "pause"
  "square"
  "rotate-ccw"
  "filter"
  "sort-asc"
  "sort-desc"
  "menu"
  "more-vertical"
  "more-horizontal"
  "arrow-up"
  "arrow-down"
  "arrow-left"
  "arrow-right"
  "upload"
  "download-cloud"
  "loader"
  "spinner"
)

echo "Downloading ${#ICONS[@]} Lucide icons..."

for icon in "${ICONS[@]}"; do
  url="https://unpkg.com/lucide-static@latest/icons/${icon}.svg"
  output="$ICONS_DIR/${icon}.svg"
  
  if [ -f "$output" ]; then
    echo "  ✓ $icon (exists)"
  else
    curl -s "$url" -o "$output" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "  ✓ $icon"
    else
      echo "  ✗ $icon (failed)"
    fi
  fi
done

echo ""
echo "Done! Icons saved to $ICONS_DIR/"
