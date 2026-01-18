# Packaging templates

Rendered by the packaging CLI (`pnpm --filter @soma/packaging run bundle` or `bundle:release`) into the bundle staging dir.

Variables available to all templates (compatible with Nunjucks syntax: `{{var}}`):
- `name` – package name (e.g. `soma-daemon`)
- `version` – daemon/agent version (from `daemons_version`)
- `desktop_version` – desktop app version (used for both Soma + Tapia desktop apps)
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
- `install/uninstall.sh.j2` – uninstaller script.
- `readme/README.md.j2` – bundle README.

How they are used:
- `pnpm --filter @soma/packaging run bundle` renders all templates into the bundle staging dir for local builds.
- `pnpm --filter @soma/packaging run bundle:release` does the same for CI release bundles (after downloading assets).
- The bundle output directory includes standalone `install.sh` and `uninstall.sh` helper scripts next to the packaged artifacts.
- Linux package contents include: binaries, README, systemd units.
- macOS package contents include: binaries, README, launchd plists, desktop app.
- Zip artifacts (when published) should include both services (daemon+agent) plus README, `install.sh`, and `uninstall.sh`.

Conventions:
- Binaries are expected at `{{install_prefix}}/bin/soma-daemon` and `{{install_prefix}}/bin/soma-agentd`.
- Services are not auto-enabled; operators should `systemctl enable --now soma-daemon` (and `soma-agentd`) or load the LaunchDaemons via `launchctl`.
