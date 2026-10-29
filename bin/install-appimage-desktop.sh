#!/usr/bin/env bash
#
# Point the user-level `things.desktop` entry at the packaged AppImage.
#
# The dev and packaged builds share the same window app id (`things`, the
# binary name), so both want to own `~/.local/share/applications/things.desktop`
# and `com.juangargiulo.things.desktop`. Only one entry can be installed at a
# time: `bin/install-dev-desktop.sh` claims it for dev sessions (bun run
# dev-icon), this script claims it for the AppImage. Whichever app id is
# installed is what a pinned launcher (KDE/GNOME) will run — pinning the
# AppImage window while the dev entry is installed launches the dev binary,
# which fails with "Could not connect to localhost" unless Vite is running.
#
# Usage:
#   bin/install-appimage-desktop.sh          # install / refresh
#   bin/install-appimage-desktop.sh --remove # uninstall
#
# Set THINGS_APPIMAGE=<path> to point at a specific AppImage; by default the
# newest Things_*_amd64.AppImage under target/release/bundle/appimage is used.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

APP_ID="things"
# Keep in sync with the Tauri identifier in tauri.conf.json (portal app id).
PORTAL_APP_ID="$(sed -n 's/.*"identifier"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
	"$ROOT_DIR/src-tauri/tauri.conf.json" | head -1)"
PORTAL_APP_ID="${PORTAL_APP_ID:-com.juangargiulo.things}"

BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle/appimage"
APPIMAGE_PATH="${THINGS_APPIMAGE:-$(ls -t "$BUNDLE_DIR"/Things_*_amd64.AppImage 2>/dev/null | head -1)}"
ICON_SRC="$ROOT_DIR/src-tauri/icons/icon.png"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP_DIR="$DATA_HOME/applications"
ICON_THEME_DIR="$DATA_HOME/icons/hicolor"
DESKTOP_FILE="$DESKTOP_DIR/$APP_ID.desktop"
PORTAL_DESKTOP_FILE="$DESKTOP_DIR/$PORTAL_APP_ID.desktop"

remove() {
	rm -f "$DESKTOP_FILE" "$PORTAL_DESKTOP_FILE"
	find "$ICON_THEME_DIR" -type f -path "*/apps/$APP_ID.png" -delete 2>/dev/null || true
	command -v update-desktop-database >/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
	command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || true
	echo "Removed $DESKTOP_FILE, $PORTAL_DESKTOP_FILE and icons/$APP_ID.png."
}

if [[ "${1:-}" == "--remove" ]]; then
	remove
	exit 0
fi

if [[ -z "$APPIMAGE_PATH" ]]; then
	echo "error: no AppImage found under $BUNDLE_DIR" >&2
	echo "       run 'bun run build-linux' first, or set THINGS_APPIMAGE=<path>." >&2
	exit 1
fi
if [[ ! -f "$APPIMAGE_PATH" ]]; then
	echo "error: AppImage not found: $APPIMAGE_PATH" >&2
	exit 1
fi
if [[ ! -f "$ICON_SRC" ]]; then
	echo "error: icon not found: $ICON_SRC" >&2
	exit 1
fi

mkdir -p "$DESKTOP_DIR" "$ICON_THEME_DIR/512x512/apps"
install -m 0644 "$ICON_SRC" "$ICON_THEME_DIR/512x512/apps/$APP_ID.png"

# No Name=(dev) suffix: this is the launcher users pin and share.
cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Things
Comment=Things (AppImage)
Exec=$APPIMAGE_PATH
Icon=$APP_ID
StartupWMClass=$APP_ID
Terminal=false
Categories=Utility;
EOF

cat >"$PORTAL_DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Things
Comment=Things (AppImage, portal identity)
Exec=$APPIMAGE_PATH
Icon=$APP_ID
Terminal=false
NoDisplay=true
Categories=Utility;
EOF

command -v update-desktop-database >/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || true

echo "Installed $DESKTOP_FILE"
echo "Installed $PORTAL_DESKTOP_FILE (portal app id: $PORTAL_APP_ID)"
echo "Exec: $APPIMAGE_PATH"
echo "Unpin and re-pin the launcher so it picks up the new entry."
