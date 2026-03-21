# 10. Quality Requirements

This section lists concrete “quality scenarios” that guide design and testing.

## Availability and offline

- A workspace can operate on LAN with no internet: peers discover via mDNS and sync directly.
- When the internet is available, peers can discover/dial via rendezvous and fall back to relays.
- Always-on bots (VDF role) can improve availability by caching frequently needed content.

## Security

- A remote, untrusted peer cannot gain membership without a valid signed capability.
- A cache-only peer cannot become a source of truth for user uploads (no upload endpoints; cache fills only via fetch-by-CID).
- A peer never persists/serves blob bytes that do not match the requested CID.

## Operability

- Server daemons expose `GET /healthz` and `GET /metrics` for monitoring and alerting.
- Logs are structured (`tracing`) and controllable via `RUST_LOG`.
- Startup fails if database migrations fail (no partially-started service with wrong schema).

## Performance

- UI remains responsive: networking and storage live in `soma-daemon`.
- Peer loop is not blocked by slow handlers: event dispatch uses bounded queues/backpressure.

## Maintainability

- New features should be implemented primarily in shared crates (`backend/crates/*`) with thin controller layers in bins.
- Protocol changes are expressed in `proto/` and compiled via `backend/crates/proto-build`.
