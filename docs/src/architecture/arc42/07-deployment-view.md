# 7. Deployment View

Soma is deployed as a desktop application (for end users) plus optional server daemons (for connectivity, onboarding, and availability).

## Desktop deployment

- Soma is packaged as an Electron app (`desktop/soma`) and talks to `soma-daemon` over a Unix socket gRPC API.
- Desktop IPC uses a Unix domain socket; no inbound HTTP ports are required for the desktop daemon.
- Tapia is shipped as a separate Tauri app (`desktop/tapia-app`); it can reuse daemon APIs for shared state. The legacy Electron app (`desktop/tapia`) remains in the repo but is not the primary target.

## Server deployment (typical)

- `soma-relayd`: public-facing relay nodes for NAT traversal fallback.
- `soma-rendezvousd`: public-facing rendezvous server for discovery.
- `soma-botd`: optional always-on bot (VDF role) for caching and join decision automation.
- `soma-bffd`: optional HTTP service for LLM-backed features.

## Local development topologies

### Host processes

- Run the desktop daemon and desktop apps directly on the host (`cargo run`, `pnpm dev`).
- Optionally run server peers on the host (`cargo run -p soma-relayd`, etc.).

### Docker Compose

- Compose bundles live under `compose/` and are aggregated by `compose.yml`.
- The root `justfile` has `just compose-up` / `just compose-logs` helpers.

### Kubernetes / Helm

- Helm charts and manifests live under `deploy/`.
- Server daemons are designed to be containerized with health/metrics endpoints.
