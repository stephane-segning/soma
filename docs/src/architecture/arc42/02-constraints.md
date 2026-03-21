# 2. Constraints

## Technical constraints

- **Desktop backends expose no HTTP server**: `soma-daemon` uses gRPC over Unix Domain Socket (UDS); desktop backends must not depend on Axum.
- **Server backends use Axum + metrics**: `soma-botd`, `soma-relayd`, `soma-rendezvousd`, `soma-bffd` expose `GET /healthz` and `GET /metrics`.
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
