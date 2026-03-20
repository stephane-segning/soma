# 5. Building Block View

This section lists the major building blocks in the repo and how they relate.

## Level 1: System decomposition

- **Desktop apps** (`desktop/`)
  - `desktop/soma`: main UI (Electron).
  - `desktop/tapia`: typing companion UI (Electron).
- **Backend workspace** (`backend/`)
  - Binaries under `backend/bins/*` (daemons/services).
  - Shared crates under `backend/crates/*` (peer runtime, storage, networking, metrics, …).
- **Protocols** (`proto/`): protobuf service and message definitions.
- **Deployment** (`deploy/`, `compose/`, `Dockerfile`): helm charts, compose bundles, container images.

## Level 2: Backend binaries

- `backend/bins/daemon` (`soma-daemon`)
  - libp2p peer identity + networking + local storage.
  - gRPC over UDS controller surface (tonic).
- `backend/bins/botd` (`soma-botd`)
  - libp2p peer with cache-only blob behaviour (VDF role).
  - Axum HTTP surface for info/health/metrics; optional admin control plane in `admin` mode.
- `backend/bins/relayd` (`soma-relayd`)
  - libp2p Circuit Relay v2 server + Axum health/metrics.
- `backend/bins/rendezvousd` (`soma-rendezvousd`)
  - libp2p Rendezvous server + Axum health/metrics.
- `backend/bins/bffd` (`soma-bffd`)
  - Axum business API for LLM-facing features; optional libp2p peer for diagnostics.
- `backend/bins/agentd` (`soma-agentd`)
  - desktop-only worker for local compute (LLM inference, embeddings, …).
- `backend/bins/serverd` (`soma-serverd`)
  - convenience “all-in-one” runner (dev/operator ergonomics).

## Level 3: Key shared crates

- `backend/crates/peer` (`soma-peer`): libp2p behaviour wiring, protocol IDs, peer command/event loop.
- `backend/crates/net` (`soma-net`): transport and identity helpers (e.g., default identity path).
- `backend/crates/membership` (`soma-membership`): join deciders, policies, capability flows.
- `backend/crates/storage` (`soma-storage`): SQL repositories and migrations.
- `backend/crates/vdfs` (`soma-vdfs`): blob provider boundary and CAS helpers (name kept for historical reasons).
- `backend/crates/socket` (`soma-socket`): gRPC serving helpers for Unix sockets.
- `backend/crates/metrics` (`soma-metrics`): Prometheus metrics router helpers.
- `backend/crates/proto-build` (`soma-proto-build`): compile-time prost/tonic bindings for `proto/`.
