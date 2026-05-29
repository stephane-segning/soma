# Packaging and Deployment

Soma ships as **two artifacts**: one Tauri V2 desktop app and one server binary (`somad`). Both are thin shells around the same shared Rust crates — the desktop embeds them in its `src-tauri` host process via the `desktop-*` crates, the server runs them as subcommands of a unified binary. This page summarizes how each is packaged and operated.

## Desktop Application Packaging

- **Targets** – macOS `arm64` (notarized `.dmg` + `.zip`) and Linux `amd64` + `arm64` (`.deb` + `.AppImage`). Windows is not supported.
- **Contents** – a single Tauri V2 bundle built from `desktop/desktop-app/`. The React/Vite renderer plus the Rust `src-tauri` host (composed from the `desktop-*` crates) ship as one app; the peer and agent runtimes are embedded in-process inside the host binary. There are **no separate daemon or agent binaries** and no native `.node` addon.
- **Build tooling** – the **Tauri bundler** (`tauri build`) drives both the renderer build and the macOS/Linux bundle/sign/notarize steps. No `electron-builder`, no `@napi-rs/cli`, no external `desktop/packaging/` tooling, no `@soma/packaging` CLI.
- **macOS signing + notarization** – the Tauri bundler signs with a **Developer ID Application** certificate and notarizes via `notarytool` (credentials are passed from the workflow's Apple secrets). It produces a notarized `.dmg` (open and drag `Soma.app` into Applications) and a notarized `.zip` (unzip `Soma.app` anywhere). No `/Library/LaunchAgents`, no `pkgbuild`, no sudo, no `xattr` quarantine stripping, no install/uninstall scripts.
- **Linux** – one `.deb` and one `.AppImage` per arch published to the GitHub Release. Install the `.deb` with `sudo apt install ./soma-desktop-linux-<arch>.deb`; or `chmod +x` the `.AppImage` and run it directly. No systemd unit is shipped; autostart is the user's choice (a `~/.config/autostart/` `.desktop` file is the conventional path).
- **Release pipeline** – `.github/workflows/release-desktop.yml` (`workflow_dispatch`) reads the `(os, arch)` matrix from `.github/targets.json`, builds the `desktop/desktop-app/` bundles via `tauri-apps/tauri-action`, signs + (on macOS) notarizes, renames the bundles to the versionless `soma-desktop-<os>-<arch>.<ext>` convention, and publishes them to a `desktop-v*` GitHub Release alongside a `SHA256SUMS` file. (The macOS signing/notarization path was confirmed by a real `workflow_dispatch` run.)
- **Login items** – a macOS Login Item / autostart is registered when the user opts in; the peer is alive only while the process is running, and the macOS tray keeps it live after the window closes.

The embedded peer is online only while Soma is open. Long-term availability for a space is provided by a `somad bot` running as a space mirror — see "Supporting Infrastructure" below.

## Server: `somad`

One binary, subcommand-dispatched. Modes are selected at runtime; behavior shared across all of them (clap CLI + env, `mimalloc`, `tracing`) is unified.

```
somad bot         [--http-addr ...] [--db-url ...] [--listen-addrs ...] [--mode bot|admin]
somad relay       [--http-addr ...]
somad rendezvous  [--http-addr ...]
somad bff         [--http-addr ...] [--p2p-enable]
somad all         --config server.toml      # composes multiple modes in one process
```

Each subcommand also accepts a `generate-identity` action where applicable (`somad relay generate-identity`, `somad rendezvous generate-identity`, `somad bot generate-identity`) for one-shot keypair creation. `SOMA_DATA_DIR` (env) anchors the persisted libp2p identity files; see `somad <subcommand> --help` for the authoritative flag list.

Packaging:

- **One image** — `ghcr.io/<owner>/somad`. Built from one `Dockerfile` (no per-service targets).
- **Base** — `gcr.io/distroless/static-debian12:nonroot`.
- **Multi-arch** — `amd64` + `arm64`, built from prebuilt MUSL binaries copied in (no Rust compile during `docker build`).
- **Release pipeline** — `.github/workflows/release-server.yml` (`workflow_dispatch`) reads the server slice of `.github/targets.json` and publishes one image, runtime-multiplexed by subcommand.

Mode is selected at runtime via the entrypoint args, e.g. `docker run ghcr.io/.../somad bot --http-addr 0.0.0.0:8080 ...`.

## Supporting Infrastructure

The same `somad` image provides every server-side role; each subcommand is its own Helm release.

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

### LLM BFF (`somad bff`)

- HTTP-only provider integration for LLMs (no libp2p by default). Listens on `0.0.0.0:8083` and exposes `/metrics`; the BFF API itself is served on the same port.
- `--p2p-enable` turns on an optional diagnostic libp2p peer for testing — off in production.
- Deployed via Helm like the other services; horizontally scalable behind a normal Service/Ingress since it holds no peer state.

### Optional Hosted Bots

- `somad bot` (`--mode bot|admin`) provides always-on availability for a space (a "space mirror"). The same image runs as a headless peer + cache, configured via flags/env for `SOMA_DATABASE_URL`, libp2p listen addrs, and (in `admin` mode) the authenticated control-plane endpoints under `/v1/*`. The cache/announce semantics are described in [AGENTS.md § "Bots and always-on availability"](https://github.com/stephane-segning/soma/blob/main/AGENTS.md#bots-and-always-on-availability).

## Release and Operations Workflow

1. Build, sign, and notarize the Soma desktop app via `release-desktop.yml`; the workflow publishes per-`(os, arch)` assets plus a `SHA256SUMS` file to a `desktop-v*` Release. Users download directly from GitHub — there is no `curl | bash` bootstrap.
2. Build the `somad` server image via `release-server.yml`; the workflow publishes multi-arch tags to `ghcr.io/<owner>/somad`.
3. Update Helm chart values with new container tags for rendezvous, relay, or hosted bot deployments.
4. Use `helm upgrade` to roll out infrastructure changes; Kubernetes handles restarts and liveness probes keep pods healthy.
5. Monitor relay bandwidth/memory and rendezvous registration counts to plan scaling.

The infrastructure components never store user content — they only facilitate peer discovery and encrypted transport — so PII risk stays on user-controlled devices while still delivering reliable connectivity.

[^rendezvous]: https://docs.libp2p.io/concepts/discovery-routing/rendezvous/
[^relay]: https://docs.libp2p.io/concepts/nat/circuit-relay/
