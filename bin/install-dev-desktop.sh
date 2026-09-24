#!/usr/bin/env bash
#
# Make the Tauri dev window show the Things icon on GNOME/Wayland.
#
# On Wayland, GNOME ignores the window icon set by the app. It resolves the
# dock / Activities / Alt-Tab icon by matching the window's app id (WM class)
# against an installed .desktop file, then loading `Icon=` from the icon theme.
# `tauri dev` installs neither, so you get the generic placeholder icon.
#
# This script installs a user-level .desktop entry + icon that point at the
# debug binary, so the icon renders while developing.
#
# Usage:
#   bin/install-dev-desktop.sh          # install / refresh
#   bin/install-dev-desktop.sh --remove # uninstall
#
# Re-run it after moving the repo, or whenever the icon looks stale.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

APP_ID="things"
BIN_PATH="${THINGS_BIN:-$ROOT_DIR/src-tauri/target/debug/things}"
ICON_SRC="$ROOT_DIR/src-tauri/icons/icon.png"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP_DIR="$DATA_HOME/applications"
ICON_THEME_DIR="$DATA_HOME/icons/hicolor"
DESKTOP_FILE="$DESKTOP_DIR/$APP_ID.desktop"

remove() {
	rm -f "$DESKTOP_FILE"
	find "$ICON_THEME_DIR" -type f -path "*/apps/$APP_ID.png" -delete 2>/dev/null || true
	command -v update-desktop-database >/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
	command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || true
	echo "Removed $DESKTOP_FILE and icons/$APP_ID.png from the user icon theme."
}

if [[ "${1:-}" == "--remove" ]]; then
	remove
	exit 0
fi

if [[ ! -f "$ICON_SRC" ]]; then
	echo "error: icon not found: $ICON_SRC" >&2
	exit 1
fi

mkdir -p "$DESKTOP_DIR" "$ICON_THEME_DIR/512x512/apps"
install -m 0644 "$ICON_SRC" "$ICON_THEME_DIR/512x512/apps/$APP_ID.png"

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Things (dev)
Comment=Things development build
Exec=$BIN_PATH
Icon=$APP_ID
StartupWMClass=$APP_ID
Terminal=false
Categories=Utility;
EOF

if [[ ! -x "$BIN_PATH" ]]; then
	echo "warning: dev binary not found at $BIN_PATH" >&2
	echo "         run 'bun run linux' once, or set THINGS_BIN=<path>." >&2
fi

command -v update-desktop-database >/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || true

echo "Installed $DESKTOP_FILE"
echo "Icon: $ICON_THEME_DIR/512x512/apps/$APP_ID.png"
echo "Restart the dev app to see the icon in the dock / Activities."
