# 7. Deployment View

Soma is deployed as a desktop application (for end users) plus optional server
daemons (for connectivity, onboarding, and availability).

## Desktop deployment

- Soma is packaged as an Electron app (`desktop/soma`). The `@soma/node` napi
  addon — a cdylib that links the `soma-daemon` and `soma-agentd` library
  crates — is unpacked next to the app and loaded by the Electron main
  process at startup.
- There is no separate daemon process and no Unix-socket IPC; daemon
  operations are plain Rust calls inside the Electron main process. The only
  inter-process boundary on the desktop side is the renderer ↔ main Electron
  IPC bridge.
- Tapia is shipped as a separate Electron app (`desktop/tapia`).

## Server deployment (typical)

All server peers are subcommands of the single `somad` binary:

- `somad relay`: public-facing relay nodes for NAT traversal fallback.
- `somad rendezvous`: public-facing rendezvous server for discovery.
- `somad bot`: optional always-on bot (VDF role) for caching and join-decision
  automation.
- `somad bff`: optional HTTP service for LLM-backed features.
- `somad all --config <file>`: compose multiple modes inside one process via a
  TOML config.

## Local development topologies

### Host processes

- Run the desktop app directly: `just desktop-run-soma`. The embedded daemon
  starts inside the Electron main process — no separate daemon to launch.
- Optionally run server peers on the host:
  `just backend-run-bot` / `just backend-run-relay` / `just backend-run-rendezvous` /
  `just backend-run-bff` (all dispatch to the single `somad` binary).

### Docker Compose

- Compose bundles live under `compose/` and are aggregated by `compose.yml`.
- The root `justfile` has `just compose-up` / `just compose-logs` helpers.

### Kubernetes / Helm

- Helm charts and manifests live under `deploy/`.
- The `somad` container has health/metrics endpoints regardless of which
  subcommand it is run with.
