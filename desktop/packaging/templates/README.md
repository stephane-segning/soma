# Packaging templates

Rendered by the packaging CLI (`pnpm --filter @soma/packaging run bundle` or `bundle:release`) into the bundle staging dir.

Variables available to all templates (compatible with Nunjucks syntax: `{{var}}`):
- `name` – package name (e.g. `soma-daemon`)
- `version` – daemon/agent version (from `daemons_version`)
- `desktop_version` – desktop app version (used for the Soma desktop app)
- `bundle_version` – bundle version label
- `os` / `arch` – target platform identifiers (`linux|macos`, `amd64|arm64`; macOS supports `arm64` only)
- `install_prefix` – default `/usr/local`
- `service_label_daemon` – LaunchAgent/service label for daemon (`digital.camer.soma.daemon`)
- `service_label_agent` – LaunchAgent/service label for agent (`digital.camer.soma.agentd`)
- `homepage` – project homepage
- `docs_url` – docs page (GitHub Pages)
- `docker_images` – newline-separated docker refs (may be empty)
- `repo` – bundle release repo as `<owner>/<repo>`
- `daemons_repo` / `desktop_repo` – source repos for upstream release assets
- `daemons_tag` / `desktop_tag` – source release tags used for the bundle
- `daemons_manifest_source` / `desktop_manifest_source` – explicit manifest path/URL or `not used`

Templates:
- `systemd/soma-daemon.service.j2` – systemd **user** unit for Linux.
- `systemd/soma-agentd.service.j2` – systemd **user** unit for Linux (agent).
- `launchd/digital.camer.soma.daemon.plist.j2` – launchd LaunchAgent plist for macOS.
- `launchd/digital.camer.soma.agentd.plist.j2` – launchd LaunchAgent plist for macOS (agent).
- `install/install.sh.j2` – installer script.
- `install/uninstall.sh.j2` – uninstaller script.
- `readme/README.md.j2` – bundle README.

How they are used:
- `pnpm --filter @soma/packaging run bundle` renders all templates into the bundle staging dir for local builds.
- `pnpm --filter @soma/packaging run bundle:release` does the same for CI release bundles (after downloading assets).
- Release bundles can pull daemons and desktop artifacts from different repos via `--daemons-repo` / `--desktop-repo`, and can consume explicit JSON manifests via `--daemons-manifest` / `--desktop-manifest`.
- The bundle output directory includes standalone `install.sh` and `uninstall.sh` helper scripts next to the packaged artifacts.
- `install.sh` performs a best-effort migration by stopping/removing legacy root/system services and stale root-owned `/tmp/soma-daemon.sock`/`/tmp/soma-agentd.sock` before installing and starting user-level services.
- Linux package contents include: binaries, README, systemd user units.
- macOS package contents include daemon/agent app bundles, README, launchd LaunchAgents, and desktop apps.
- Zip artifacts (when published) should include both services (daemon+agent) plus README, `install.sh`, and `uninstall.sh`.

Conventions:
- Binaries are expected at `{{install_prefix}}/bin/soma-daemon` and `{{install_prefix}}/bin/soma-agentd`.
- Production services bind sockets under the current user's runtime temp area, not directly under global `/tmp`: Linux uses `%t/soma/*.sock` (`$XDG_RUNTIME_DIR/soma`), and macOS uses `/tmp/soma-$(id -u)/soma/*.sock`.
- The installer starts the packaged user services. Operators installing package contents manually should `systemctl --user enable --now soma-daemon` (and `soma-agentd`) or load the LaunchAgents via `launchctl bootstrap gui/$(id -u)`.
