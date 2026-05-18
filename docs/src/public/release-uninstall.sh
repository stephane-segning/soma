#!/usr/bin/env bash
# Soma release-shipped uninstaller.
#
# Lives in the repo (reviewed in PR) and is copied as the `uninstall.sh`
# asset of every desktop-v* GitHub Release. The bootstrap script downloads
# this file and execs it after SHA256 verification.
#
# Contract:
#   - No sudo for the user-domain install (~/Applications).
#   - Best-effort cleanup of legacy LaunchAgent / systemd-user units that
#     predate the single-Electron-app model. Old plists in /Library live
#     behind sudo; we attempt removal only if sudo is available without a
#     password prompt (i.e. truly interactive sessions), otherwise we skip.
#
# Environment:
#   SOMA_PURGE_DATA=1  also wipe ~/Library/Application Support/Soma (macOS)
#                      or ~/.local/share/soma (Linux).

set -euo pipefail

os_raw="$(uname -s)"
os="$(printf '%s' "$os_raw" | tr '[:upper:]' '[:lower:]')"

purge="${SOMA_PURGE_DATA:-0}"

install_root="${HOME}/Applications"

remove_legacy_launchagents() {
  # User-domain LaunchAgent labels from the deprecated multi-binary bundle.
  local labels=(digital.camer.soma.daemon digital.camer.soma.agentd)
  if command -v launchctl >/dev/null 2>&1; then
    local uid; uid="$(id -u)"
    for label in "${labels[@]}"; do
      launchctl bootout "gui/${uid}/${label}" >/dev/null 2>&1 || true
    done
  fi

  # User-domain plists live under ~/Library/LaunchAgents; safe to rm without sudo.
  local user_la="${HOME}/Library/LaunchAgents"
  for label in "${labels[@]}"; do
    rm -f "${user_la}/${label}.plist" 2>/dev/null || true
  done

  # System-domain plists require sudo. Only attempt non-interactively (-n) so
  # the uninstaller never blocks waiting for a password. Failures are silent.
  local sys_la="/Library/LaunchAgents"
  for label in "${labels[@]}"; do
    if [ -e "${sys_la}/${label}.plist" ]; then
      if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
        sudo -n rm -f "${sys_la}/${label}.plist" >/dev/null 2>&1 || true
      fi
    fi
  done
}

remove_legacy_systemd_units() {
  local user_units_dir="${HOME}/.config/systemd/user"
  local units=(soma-daemon.service soma-agentd.service)
  if command -v systemctl >/dev/null 2>&1; then
    for unit in "${units[@]}"; do
      systemctl --user stop "$unit" >/dev/null 2>&1 || true
      systemctl --user disable "$unit" >/dev/null 2>&1 || true
    done
  fi
  for unit in "${units[@]}"; do
    rm -f "${user_units_dir}/${unit}" 2>/dev/null || true
  done
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
}

case "$os" in
  darwin)
    target="${install_root}/Soma.app"
    if [ -e "$target" ]; then
      echo "Removing ${target}..."
      rm -rf "$target"
    else
      echo "No install found at ${target}; nothing to remove."
    fi
    remove_legacy_launchagents
    if [ "$purge" = "1" ]; then
      data_dir="${HOME}/Library/Application Support/Soma"
      if [ -e "$data_dir" ]; then
        echo "Purging ${data_dir}..."
        rm -rf "$data_dir"
      fi
    else
      echo "User data preserved at ~/Library/Application Support/Soma."
      echo "Set SOMA_PURGE_DATA=1 to also wipe it."
    fi
    ;;
  linux)
    target="${install_root}/Soma.AppImage"
    if [ -e "$target" ]; then
      echo "Removing ${target}..."
      rm -f "$target"
    else
      echo "No install found at ${target}; nothing to remove."
    fi
    remove_legacy_systemd_units
    if [ "$purge" = "1" ]; then
      data_dir="${HOME}/.local/share/soma"
      if [ -e "$data_dir" ]; then
        echo "Purging ${data_dir}..."
        rm -rf "$data_dir"
      fi
    else
      echo "User data preserved at ~/.local/share/soma."
      echo "Set SOMA_PURGE_DATA=1 to also wipe it."
    fi
    ;;
  *)
    echo "Unsupported OS: $os_raw" >&2
    exit 1
    ;;
esac

echo "Soma uninstall complete."
