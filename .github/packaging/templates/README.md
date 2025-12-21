# Packaging templates

Rendered by `.github/scripts/release_bundle.py` into the bundle staging dir.

Variables available to all templates (string.Template syntax: `$var`):
- `name` – package name (e.g. `soma-daemon`)
- `version` – daemon/agent version (from `daemons_version`)
- `desktop_version` – desktop app version (from `desktop_version`)
- `bundle_version` – bundle version label
- `os` / `arch` – target platform identifiers (`linux|macos`, `amd64|arm64`)
- `install_prefix` – default `/usr/local`
- `service_label_daemon` – LaunchDaemon/service label for daemon (`digital.camer.soma.daemon`)
- `service_label_agent` – LaunchDaemon/service label for agent (`digital.camer.soma.agentd`)
- `homepage` – project homepage
- `docs_url` – docs page (GitHub Pages)
- `docker_images` – newline-separated docker refs (may be empty)
- `repo` – `<owner>/<repo>` GitHub repo

Templates:
- `systemd/soma-daemon.service.j2` – systemd unit for Linux.
- `systemd/soma-agentd.service.j2` – systemd unit for Linux (agent).
- `launchd/digital.camer.soma.daemon.plist.j2` – launchd plist for macOS.
- `launchd/digital.camer.soma.agentd.plist.j2` – launchd plist for macOS (agent).
- `install/install.sh.j2` – installer script.
- `readme/README.md.j2` – bundle README.

How they are used:
- `release_bundle.py` renders all templates into the bundle staging dir for each OS/arch matrix run.
- Linux deb/rpm/pkg contents include: binaries, README, install.sh, systemd units.
- macOS pkg/dmg/zip contents include: binaries, README, install.sh, launchd plists.
- Zip artifacts always include both services (daemon+agent) plus README/install.

Conventions:
- Binaries are expected at `$install_prefix/bin/soma-daemon` and `$install_prefix/bin/soma-agentd`.
- Services are not auto-enabled; operators should `systemctl enable --now soma-daemon` (and `soma-agentd`) or load the LaunchDaemons via `launchctl`.
- Update `ctx` in `release_bundle.py` when adding new template variables.
