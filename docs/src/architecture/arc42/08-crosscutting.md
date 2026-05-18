# 8. Crosscutting Concepts

## Configuration

- The `somad` server binary uses `clap` with environment variable support.
- Common env vars include:
  - `SOMA_BLOB_DIR` (blob pool / cache root)
  - `SOMA_LISTEN_ADDRS`, `SOMA_RDV_ADDRS`, `SOMA_RELAY_ADDRS` (libp2p connectivity)
  - `HTTP_ADDR` (server HTTP bind)
- The desktop daemon library is configured by the napi addon's `StartConfig`
  (constructed in
  `desktop/soma/src/main/services/addon-runtime.ts`); there are no
  `SOMA_*` env vars on the desktop side.

## Observability

- Server daemons expose:
  - `GET /healthz` → `"ok"`
  - `GET /metrics` → Prometheus text format
- Rust logging uses `tracing` with `RUST_LOG` filtering.

## Storage and migrations

- The desktop daemon library uses a local SQLite database under Electron's `userData/daemon/`. Path is configured via the napi addon's `StartConfig.daemonDbPath`.
- `somad bot` uses `SOMA_DATABASE_URL` and supports SQLite or Postgres via SQLx AnyPool.
- Migrations live in `backend/crates/storage/migrations` and are applied at startup.

## Security

- The desktop daemon runs in-process inside the Electron main process; there is no public-network or local-IPC API surface to attack. The only inter-process boundary is the renderer ↔ main Electron IPC bridge, which exposes a narrow controller set.
- Capability-based membership avoids accounts/passwords and supports explicit delegation.
- Blob CAS verifies bytes match the claimed CID before persisting/serving.

See `docs/src/security/threat-model.md` for the consolidated threat model.

## Performance and backpressure

- Peer event handling uses a dispatcher with bounded per-handler queues to keep the peer loop responsive.
- Blob transfer is currently size-bounded (single message request/response); large blob support requires chunking/streaming.
