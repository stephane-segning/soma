# Packaging and Deployment

Soma ships as **two artifacts**: one Electron desktop app and one server binary (`somad`). Both are thin shells around the same shared Rust crates — the desktop loads them as a napi-rs `.node` addon, the server runs them as subcommands of a unified binary. This page summarizes how each is packaged and operated.

## Desktop Application Packaging

- **Targets** – macOS `arm64` (notarized `.zip`) and Linux `amd64` + `arm64` (`.AppImage`). Windows is not supported.
- **Contents** – a single Electron bundle (`desktop/soma/`) embedding the `@soma/node` napi addon (`soma-node.<os>-<arch>.node`) built from `backend/crates/soma-node`. There are **no separate daemon or agent binaries** on the desktop side; the peer and agent runtimes are in-process inside the addon.
- **Build tooling** – `electron-builder` for the app, `@napi-rs/cli` for the native addon. No external `desktop/packaging/` tooling, no `@soma/packaging` CLI, no `.deb` / `.pkg` / `.tar.gz` bundles.
- **macOS signing + notarization** – `electron-builder.yml` has `notarize: true`; the workflow uses **Developer ID Application** signing plus `notarytool` and `xcrun stapler staple`. The user downloads the notarized zip, unzips, and drags `Soma.app` into `~/Applications/` — no `/Applications`, no `/Library/LaunchAgents`, no `pkgbuild`, no sudo, no `xattr` quarantine stripping, no install/uninstall scripts.
- **Linux AppImage** – one `.AppImage` per arch published to the GitHub Release. The user `chmod +x`'s it and runs it; placing it under `~/Applications/` is encouraged but not required. No systemd unit is shipped; autostart is the user's choice (a `~/.config/autostart/` `.desktop` file is the conventional path).
- **Release pipeline** – `.github/workflows/release-desktop.yml` (`workflow_dispatch`) reads the `(os, arch)` matrix from `.github/targets.json`, builds + signs + (on macOS) notarizes, and publishes assets to a `desktop-v*` GitHub Release alongside a `SHA256SUMS` file.
- **Login items** – macOS Login Item is registered via `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })` when the user opts in; the peer is alive only while the process is running, and the macOS tray keeps it live after the window closes.

The embedded peer is online only while Soma is open. Long-term availability for a space is provided by a `somad bot` running as a space mirror — see "Supporting Infrastructure" below.

## Server: `somad`

One binary, subcommand-dispatched. Modes are selected at runtime; behavior shared across all of them (clap CLI + env, `mimalloc`, `tracing`) is unified.

```
somad bot         [--http-addr ...] [--db-path ...] [--mode bot|admin] [--listen-addr ...]
somad relay       [--http-addr ...] [--data-dir ...]
somad rendezvous  [--http-addr ...] [--data-dir ...]
somad bff         [--http-addr ...] [--provider ...]
somad all         --config server.toml      # composes multiple modes in one process
```

Packaging:

- **One image** — `ghcr.io/<owner>/somad`. Built from one `Dockerfile` (no per-service targets).
- **Base** — `gcr.io/distroless/static-debian12:nonroot`.
- **Multi-arch** — `amd64` + `arm64`, built from prebuilt MUSL binaries copied in (no Rust compile during `docker build`).
- **Release pipeline** — `.github/workflows/release-server.yml` (`workflow_dispatch`) reads the server slice of `.github/targets.json` and publishes one image, runtime-multiplexed by subcommand.

Mode is selected at runtime via the entrypoint args, e.g. `docker run ghcr.io/.../somad bot --http-addr 0.0.0.0:8080 ...`.

## Supporting Infrastructure

Two lightweight libp2p services run in Kubernetes to help peers discover and connect to each other. Both are subcommands of the same `somad` image.

### Rendezvous Server

- `somad rendezvous` runs the libp2p rendezvous discovery protocol, letting peers register under namespaces like `soma-prod` or `soma-dev`.[^rendezvous]
- Deployed via Helm, usually as a simple Deployment with a public LoadBalancer Service exposing TCP/QUIC/WS ports.
- Identity persists at `${SOMA_DATA_DIR}/rendezvous/identity.key` so the Peer ID is stable across restarts (back it with a Kubernetes Secret or PVC).
- Exposes `GET /healthz` and `GET /metrics` (Prometheus); metrics are prefixed `rendezvous_`.

### Circuit Relay Nodes

- `somad relay` provides `/p2p-circuit` addresses for peers that cannot accept inbound connections because of restrictive NAT or firewalls.[^relay]
- Multiple relay pods can be deployed for redundancy; each persists its libp2p identity at `${SOMA_DATA_DIR}/relay/identity.key` so the Peer ID survives restarts.
- Peers discover relays via static config or rendezvous announcements and attempt hole punching (DCUtR) to upgrade connections whenever possible.
- Exposes `GET /healthz` and `GET /metrics`; metrics are prefixed `relay_`.

### Optional Hosted Bots

- `somad bot` (`--mode bot|admin`) provides always-on availability for a space — see "Bots and always-on availability" in AGENTS.md. The same image runs as a space mirror, configured via flags/env for `SOMA_DATABASE_URL`, libp2p listen addrs, and (in `admin` mode) the authenticated control-plane endpoints under `/v1/*`.

## Release and Operations Workflow

1. Build, sign, and notarize the Soma desktop app via `release-desktop.yml`; the workflow publishes per-`(os, arch)` assets plus a `SHA256SUMS` file to a `desktop-v*` Release. Users download directly from GitHub — there is no `curl | bash` bootstrap.
2. Build the `somad` server image via `release-server.yml`; the workflow publishes multi-arch tags to `ghcr.io/<owner>/somad`.
3. Update Helm chart values with new container tags for rendezvous, relay, or hosted bot deployments.
4. Use `helm upgrade` to roll out infrastructure changes; Kubernetes handles restarts and liveness probes keep pods healthy.
5. Monitor relay bandwidth/memory and rendezvous registration counts to plan scaling.

The infrastructure components never store user content — they only facilitate peer discovery and encrypted transport — so PII risk stays on user-controlled devices while still delivering reliable connectivity.

[^rendezvous]: https://docs.libp2p.io/concepts/discovery-routing/rendezvous/
[^relay]: https://docs.libp2p.io/concepts/nat/circuit-relay/
