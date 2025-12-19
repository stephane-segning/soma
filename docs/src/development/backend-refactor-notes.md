# Backend Refactor Notes (Daemon/Bot/BFF)

This page summarizes the implementation work done recently to move Soma’s backend from “skeleton” to “integrated”:

- daemon IPC is now real gRPC over Unix Domain Socket
- join flow is implemented as a libp2p application protocol
- relay client reservations are requested on connect
- botd exposes a minimal control plane for join decisions
- BFF chat is wired to a real LLM backend
- peer event handling is routed through a shared dispatcher (with backpressure isolation in daemon/bot)

## 1) Daemon local API: gRPC over Unix Domain Socket (UDS)

- ADR: `docs/src/architecture/adrs/0001-local-daemon-grpc.md`
- Protos: `proto/daemon/v1/daemon.proto`
- Implementation: `backend/bins/daemon/src/grpc.rs` and `backend/crates/socket/src/lib.rs`

The daemon binds a Unix socket (`--socket-path`, default `./soma-daemon.sock`) and serves tonic gRPC on it.

Testing recipe: `docs/src/development/daemon-grpcurl.md`.

## 2) Join flow: first libp2p application protocol

- Proto: `proto/classroom/v1/membership.proto`
- Protocol id: `/soma/join/1`
- Implementation: `backend/crates/peer/src/lib.rs`

Mechanics:

- Daemon calls `Daemon/JoinSpace` (gRPC).
- Daemon sends a `PeerCommand::SendJoinRequest` to `soma-peer`.
- `soma-peer` sends a libp2p request/response message (`JoinRequest` → `JoinDecision`).
- Daemon surfaces join outcomes on `Daemon/StreamEvents`.

Note: inbound join behaviour defaults to rejection unless a bot/issuer responds.

## 3) Relay client wiring

- Doc: `docs/src/architecture/peer-connectivity.md`
- Implementation: `backend/crates/peer/src/lib.rs`

Peers now:

- keep relay peers separate from rendezvous peers
- request relay reservations when a connection to a configured relay is established

## 4) Bot control plane (`soma-botd`)

- Entry: `backend/bins/botd/src/main.rs`
- Modules:
  - config: `backend/bins/botd/src/config.rs`
  - metrics: `backend/bins/botd/src/metrics.rs`
  - http control plane: `backend/bins/botd/src/http.rs`

HTTP endpoints:

- `GET /info` → bot peer id + blob dir
- `POST /v1/join` → approve/reject and issue a `MembershipCapability` (currently unsigned placeholder)
- `GET /healthz`, `GET /metrics`

## 5) BFF skeleton removal

- Bin: `backend/bins/bffd/src/main.rs` now handles all `PeerEvent` variants (no `todo!()`).
- Chat endpoint: `backend/crates/bff/src/lib.rs` calls an LLM backend over HTTP instead of echoing.

Environment variables:

- `LLM_ENDPOINT` (default: `http://127.0.0.1:11434/api/generate`)
- `LLM_MODEL` (default: `llama3`)
- `LLM_TOKEN` (optional bearer token)
- `LLM_TIMEOUT_MS` (default: 15000)

## 6) Peer event dispatcher + backpressure

- Dispatcher API: `backend/crates/peer/src/events.rs`
- Helper: `soma-peer::events::handler_with_queue(...)` wraps handlers with bounded queues.

Daemon wiring:

- `backend/bins/daemon/src/dispatch.rs` builds a dispatcher and spawns per-handler workers.
- `backend/bins/daemon/src/handlers.rs` contains focused handlers (logging, join event publishing, listen addr tracking).

Bot wiring:

- `backend/bins/botd/src/main.rs` uses the dispatcher + queue helper for peer event logging/metrics.

## 7) Builders (derive_builder)

- Workspace dep: `derive_builder` is added to `backend/Cargo.toml`.
- `PeerConfig` now lives in `backend/crates/peer/src/config.rs` with a builder (`PeerConfigBuilder`) and a convenience `PeerConfig::builder()`.

This reduces boilerplate when composing peer configs in bins.
