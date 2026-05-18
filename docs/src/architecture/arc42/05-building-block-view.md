# 5. Building Block View

This section lists the major building blocks in the repo and how they relate.

## Level 1: System decomposition

- **Desktop app** (`desktop/`)
  - `desktop/soma`: the only Electron app. The typing companion (Tapia) is
    delivered as the `/practice` route inside this app.
- **Backend workspace** (`backend/`)
  - `backend/bins/somad`: the only standalone backend binary (subcommands for
    bot / relay / rendezvous / bff / all-composed mode).
  - `backend/crates/daemon` and `backend/crates/agentd`: **library crates** (no
    binary) hosting the desktop peer + agent runtimes; linked into
    `backend/crates/soma-node`.
  - Shared crates under `backend/crates/*` (peer runtime, storage, networking,
    metrics, …).
- **Protocols** (`proto/`): protobuf service and message definitions.
- **Deployment** (`deploy/`, `compose/`, `Dockerfile`): helm charts, compose
  bundles, container images for `somad`.

## Level 2: Backend artifacts

### Server binary

- `backend/bins/somad` (`somad`)
  - Single binary with `bot` / `relay` / `rendezvous` / `bff` / `all`
    subcommands. Replaces the former per-service `soma-botd`, `soma-relayd`,
    `soma-rendezvousd`, `soma-bffd`, `soma-serverd` binaries.
  - `bot` mode: libp2p peer with cache-only blob behaviour (VDF role) + Axum
    HTTP surface for info/health/metrics; optional admin control plane in
    `admin` mode.
  - `relay` mode: libp2p Circuit Relay v2 server + Axum health/metrics.
  - `rendezvous` mode: libp2p Rendezvous server + Axum health/metrics.
  - `bff` mode: Axum business API for LLM-facing features.
  - `all` mode: TOML-composed multi-mode runner.

### Desktop runtime (in-process via napi)

- `backend/crates/soma-node` (`@soma/node`): napi-rs cdylib loaded by the
  Electron main process. Embeds the daemon + agent libraries; exposes one
  `SomaHandle` to JS.
- `backend/crates/daemon` (`soma-daemon`, library only): libp2p peer identity,
  blob store, repositories, event bus. In-process `DaemonHandle` facade for
  the napi addon.
- `backend/crates/agentd` (`soma-agentd`, library only): Yjs drift resolver and
  agent runtime. In-process `AgentHandle` facade for the napi addon.

## Level 3: Key shared crates

- `backend/crates/peer` (`soma-peer`): libp2p behaviour wiring, protocol IDs, peer command/event loop.
- `backend/crates/net` (`soma-net`): transport and identity helpers (e.g., default identity path).
- `backend/crates/membership` (`soma-membership`): join deciders, policies, capability flows.
- `backend/crates/storage` (`soma-storage`): SQL repositories and migrations.
- `backend/crates/vdfs` (`soma-vdfs`): blob provider boundary and CAS helpers (name kept for historical reasons).
- `backend/crates/metrics` (`soma-metrics`): Prometheus metrics router helpers.
- `backend/crates/proto-build` (`soma-proto-build`): compile-time prost/tonic bindings for `proto/` (used for record types; the desktop side no longer uses any tonic service stubs).
