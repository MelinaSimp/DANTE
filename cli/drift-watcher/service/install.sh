#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHER_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <watcher_token> <folder_path>"
  exit 1
fi

TOKEN="$1"
FOLDER="$2"

if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.driftai.watcher.plist"
  NODE_PATH="$(which node)"
  sed -e "s|__INSTALL_DIR__|$WATCHER_DIR|g" \
      -e "s|__WATCHER_TOKEN__|$TOKEN|g" \
      -e "s|__WATCH_FOLDER__|$FOLDER|g" \
      -e "s|/usr/local/bin/node|$NODE_PATH|g" \
      "$SCRIPT_DIR/com.driftai.watcher.plist" > "$PLIST"
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "Installed launchd agent. Logs: /tmp/drift-watcher.log"

elif [[ "$OSTYPE" == "linux"* ]]; then
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  NODE_PATH="$(which node)"
  sed -e "s|__INSTALL_DIR__|$WATCHER_DIR|g" \
      -e "s|__WATCHER_TOKEN__|$TOKEN|g" \
      -e "s|__WATCH_FOLDER__|$FOLDER|g" \
      -e "s|/usr/bin/node|$NODE_PATH|g" \
      "$SCRIPT_DIR/drift-watcher.service" > "$UNIT_DIR/drift-watcher.service"
  systemctl --user daemon-reload
  systemctl --user enable --now drift-watcher.service
  echo "Installed systemd user service. Logs: journalctl --user -u drift-watcher"

elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* ]]; then
  NODE_PATH="$(which node)"
  TASK_CMD="$NODE_PATH $WATCHER_DIR/index.js --token $TOKEN --folder $FOLDER"
  schtasks.exe /Create /F /SC ONLOGON /TN "DriftWatcher" /TR "$TASK_CMD"
  echo "Created Windows scheduled task 'DriftWatcher' (runs at logon)."
  schtasks.exe /Run /TN "DriftWatcher"
  echo "Started. View in Task Scheduler."

else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi
