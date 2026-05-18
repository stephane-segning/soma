# 2. Constraints

## Technical constraints

- **Desktop daemon is in-process**: `soma-daemon` ships as a library linked into the `@soma/node` napi addon and runs inside the Electron main process. There is no separate daemon binary, no Unix-socket IPC, and no HTTP/Axum surface on the desktop side.
- **Server backends use Axum + metrics**: `somad bot`, `somad relay`, `somad rendezvous`, `somad bff` expose `GET /healthz` and `GET /metrics`.
- **Rust workspace dependency policy**: third-party versions live only in root `Cargo.toml` under `[workspace.dependencies]`.
- **Desktop JS tooling**: `pnpm` workspace under `desktop/`.
- **Offline-first networking**: must function on LAN without servers (mDNS) and across networks with optional infra (rendezvous + relay).

## Product constraints

- **No accounts/passwords**: identity is device-based (PeerId); human names are UI-only.
- **Bots are explicit members**: VDF/bot peers are not implicit trusted infrastructure; space owners can remove/revoke them.
- **Cache-only VDF role**: bots never accept user uploads; cache writes only as a side-effect of verified fetch-by-CID.

## Operational constraints

- **Release artifacts**: GitHub Actions workflows are designed to be triggered manually (`workflow_dispatch`).
- **Container images**: backend Docker images are distroless and run as non-root.
