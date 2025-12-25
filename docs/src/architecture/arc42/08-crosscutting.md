# 8. Crosscutting Concepts

## Configuration

- Rust binaries use `clap` with environment variable support.
- Common env vars include:
  - `SOMA_BLOB_DIR` (blob pool / cache root)
  - `SOMA_LISTEN_ADDRS`, `SOMA_RDV_ADDRS`, `SOMA_RELAY_ADDRS` (libp2p connectivity)
  - `HTTP_ADDR` (server daemon HTTP bind)
  - `SOMA_DAEMON_SOCKET` (desktop daemon UDS path)

## Observability

- Server daemons expose:
  - `GET /healthz` → `"ok"`
  - `GET /metrics` → Prometheus text format
- Rust logging uses `tracing` with `RUST_LOG` filtering.

## Storage and migrations

- `soma-daemon` uses a local SQLite database by default (`SOMA_DAEMON_DB`).
- `soma-botd` uses `SOMA_DATABASE_URL` and supports SQLite or Postgres via SQLx AnyPool.
- Migrations live in `backend/crates/storage/migrations` and are applied at startup.

## Security

- Desktop daemon uses gRPC over UDS to avoid exposing a public network API surface.
- Capability-based membership avoids accounts/passwords and supports explicit delegation.
- Blob CAS verifies bytes match the claimed CID before persisting/serving.

See `docs/src/security/threat-model.md` for the consolidated threat model.

## Performance and backpressure

- Peer event handling uses a dispatcher with bounded per-handler queues to keep the peer loop responsive.
- Blob transfer is currently size-bounded (single message request/response); large blob support requires chunking/streaming.
