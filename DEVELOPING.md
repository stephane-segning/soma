# Developing in this Repository

This document describes the repository layout, code structure, and coding conventions for working on Soma and Tapia in this monorepo.

## Repository Layout

- `backend/` – Rust workspace for **all** backends (desktop + server) and supporting crates.
  - Desktop peer/agent binaries: `soma-daemon` (Unix socket; no Axum), `soma-agentd` (desktop-only companion).
  - Server peer/infra binaries: `soma-botd`, `soma-relayd`, `soma-rendezvousd`, `soma-bffd`, `soma-serverd`.
  - Crates: core domain, networking, storage, API, relay, rendezvous, BFF, and shared utilities.
- `desktop/` – Electron/React applications and packaging.
  - `desktop/app/soma/` – main Soma desktop UI.
  - `desktop/app/tapia/` – Tapia typing companion app.
  - `desktop/packaging/` – shared packaging and build configuration.
- `docs/` – MkDocs documentation (`docs/src/` for markdown, `docs/mkdocs.yml` for navigation).
- `proto/` – shared protocol definitions and codegen inputs.
- `deploy/` – Helm charts and infrastructure manifests.
- `prd/` – product requirements and high-level product documentation.
- `sbom/` – software bill of materials tooling.

When in doubt, place:

- shared Rust logic under an appropriate `backend/crates/*`.
- UI logic under `desktop/app/soma` or `desktop/app/tapia`.
- long-lived infra logic under `backend/crates/*`.
- user-facing docs under `docs/src/`.

## Tech Stack

- **Package manager**: `pnpm` (workspace at `desktop/app/pnpm-workspace.yaml`).
- **Desktop apps**: Electron + React + TypeScript.
- **Backends**: Rust.

## Dependency Policy

### Rust (Cargo workspace)

- Third-party dependency versions are declared **only** in `backend/Cargo.toml` under `[workspace.dependencies]`.
- All crates and binaries under `backend/crates/*` and `backend/bins/*` must depend on third-party crates using `{ workspace = true }`.
- If a crate needs optional capabilities, add `features = [...]` on the `{ workspace = true }` dependency in that leaf `Cargo.toml`.
- Do not add `version = "..."` for third-party crates anywhere except `backend/Cargo.toml`.

### Backends

All backends:

- use `clap` for CLI parameters and environment variable configuration.
- use `mimalloc` for allocation.

Peer/daemon backends:

- accept a **blob storage pool** path (a plain folder) via configuration for storing large binary assets.
- use `yjs-rust` to reconcile collaborative content/state.
- use SQLite on desktop; server deployments can enable PostgreSQL via Cargo features.

Specific services (all now live under `backend/`):

- **Relay** (`backend/bins/relayd`, `backend/crates/relay`): libp2p circuit-relay node, plus an Axum HTTP server and a small metrics server.
- **Rendezvous** (`backend/bins/rendezvousd`, `backend/crates/rendezvous`): libp2p rendezvous discovery service, plus an Axum HTTP server and a small metrics server.
- **Desktop peer/daemon** (`backend/bins/daemon`, `soma-daemon`): the desktop user agent (Unix socket IPC). Desktop backends must not depend on Axum.
- **Server peer/bot** (`backend/bins/botd`, `soma-botd`): a server-hosted libp2p peer/bot with an Axum control plane + metrics.
- **LLM BFF** (`backend/bins/bffd`, `backend/crates/bff`): a backend-for-frontend for interacting with LLMs via `llama-cpp-2`; runs `mimalloc` + Axum + a small metrics server. This is the only backend that does **not** use libp2p.

#### `soma-botd` internals (event handling + metrics)

`soma-botd` processes libp2p events through a small dispatcher with per-handler queues:

- Entry point: `backend/bins/botd/src/main.rs`
- Runtime loop + wiring (peer spawn, HTTP spawn, dispatcher): `backend/bins/botd/src/runtime.rs`
- Peer event handlers:
  - Metrics: `backend/bins/botd/src/event_handlers.rs` (`MetricsHandler`, handles **all** `PeerEventKind`s)
  - Logging: `backend/bins/botd/src/event_handlers.rs` (`LoggingHandler`, selected events only)
- Prometheus metrics definitions/registration: `backend/bins/botd/src/metrics.rs`

When adding new peer events or instrumentation, prefer:

- Updating `soma-peer` event definitions (`backend/crates/peer/src/lib.rs`, `backend/crates/peer/src/events.rs`)
- Adding a matching metrics/logging branch in `backend/bins/botd/src/event_handlers.rs`

### Business Logic & API Checklist

Use this list to track domain flows and where the API lives. Mark items off as you implement them end-to-end (daemon ↔ bot ↔ peer).

- [x] Space join request & decision
  - Daemon gRPC: `Daemon/JoinSpace(space_id, display_name, device_name, target_peer_id, target_multiaddrs)` (Unix socket, proto `proto/daemon/v1/daemon.proto`)
  - Bot HTTP: `POST /v1/join` (`space_id`, `subject_peer_id`, optional approval context) issues `JoinDecision` + `MembershipCapability`
- [ ] Space membership revocation/leave
  - Bot HTTP: `POST /v1/space/revoke` (botd) to revoke capabilities by `space_id` and `subject_peer_id`; daemon gRPC: `Daemon/RevokeSpace` to request or consume a revocation and drop local capability
- [ ] Space roster/query
  - Bot HTTP: `GET /v1/space/members` (botd) to list current members with roles/expiry; daemon gRPC: `Daemon/ListSpaceMembers` to fetch + cache
- [ ] Issuer delegation management (bots acting on behalf of owners)
  - Bot HTTP: `POST /v1/space/issuer-capability` (botd) to rotate/issue issuer delegation for a bot; daemon gRPC: `Daemon/IssueIssuerCapability` to accept and persist
- [ ] Space discovery/onboarding UX helpers
  - Daemon gRPC: `Daemon/DiscoverSpaces` to surface available spaces via rendezvous/relay metadata for UIs

### Frontends (Desktop Apps)

Shared frontend stack (both Soma and Tapia):

- `pnpm` workspace under `desktop/app/`
- `tailwindcss` v4 + `daisyui` v5
- `floating-ui`
- `use-debounce`
- `composed-offset-position`
- Motion for React (`motion`, https://github.com/motiondivision/motion)
- Command palette + hotkeys: `react-hotkeys-hook` and `react-cmdk`

Soma (`desktop/app/soma`):

- Uses a client to call the Soma peer/daemon over its Unix socket API.
- Uses `yoopta-editor` for rich text editing.
- Uses DaisyUI with two themes.
- Uses TanStack Query for optimistic UI flows.

Tapia (`desktop/app/tapia`):

- Uses a client to call the Soma peer/daemon over its Unix socket API (e.g., saving leaderboard state).
- Uses `simple-keyboard`.
- Needs “text segmentation + cursor ranges” and a “diff/comparison engine”; choose stable, mature packages from the JavaScript package registry (common candidates: `graphemer` / `grapheme-splitter`, and `diff-match-patch` / `diff`).
- Uses Motion for micro-interactions (cursor movement/layout animations, color transitions, correct/incorrect feedback).
- Uses XState for state machines.

## Binaries and Responsibilities

This repo intentionally has multiple binaries. Each has a distinct goal and deployment context:

### Desktop vs Server (rule of thumb)

- **Desktop**: `soma-daemon`, `soma-agentd`, `@soma/soma` (UI), `@soma/tapia` (UI) — **no Axum**.
- **Server**: `soma-botd`, `soma-relayd`, `soma-rendezvousd`, `soma-bffd`, `soma-serverd` — **Axum + metrics**.

### Desktop / Peer Backends (`backend/`)

- `soma-daemon` (`backend/bins/daemon`, run with `cargo run -p soma-daemon`): the desktop **libp2p peer identity** process (Unix socket IPC). It must not include Axum.
- `soma-botd` (`backend/bins/botd`, run with `cargo run -p soma-botd`): the server-hosted **libp2p peer identity** process for bots/agents (Axum + metrics).
- `soma-agentd` (`backend/bins/agentd`, run with `cargo run -p soma-agentd`): optional **desktop-only** companion process for long-running CPU-heavy tasks (hashing, OCR, indexing, Yjs reconciliation, local LLM inference). It should be reached via local IPC (UDS) and typically through `soma-daemon`, not directly from the UI.

### Infrastructure Backends (also `backend/`)

- `soma-relayd` (`backend/bins/relayd`, run with `cargo run -p soma-relayd`): **relay** service (libp2p circuit relay) + HTTP/Axum + metrics.
- `soma-rendezvousd` (`backend/bins/rendezvousd`, run with `cargo run -p soma-rendezvousd`): **rendezvous** service (libp2p discovery) + HTTP/Axum + metrics.
- `soma-bffd` (`backend/bins/bffd`, run with `cargo run -p soma-bffd`): **LLM BFF** service (no libp2p; `llama-cpp-2`) + HTTP/Axum + metrics.
- `soma-serverd` (`backend/bins/serverd`, run with `cargo run -p soma-serverd`): optional “all-in-one” runner that can compose multiple infrastructure services for convenience in dev.

## Code Style

### Rust

- Use stable Rust and keep code `rustfmt`-formatted.
- Prefer explicit, self-describing names; avoid single-letter identifiers except for well-understood indices.
- Keep modules small and cohesive: one primary concern per module.
- Use `tracing` for logging; avoid `println!` in production code.
- Surface errors with rich types (thiserror / anyhow patterns) rather than panicking; reserve `panic!` for truly unrecoverable situations.
- Keep async boundaries explicit and avoid blocking inside async tasks.

### TypeScript / React (Desktop Apps)

- Use modern TypeScript with `strict` type-checking.
- Follow the existing component organization in `desktop/app/*/src` (feature-oriented structure rather than huge generic folders).
- Prefer function components with hooks over class components.
- Use existing hooks and state containers before adding new global state mechanisms.
- Keep side effects (I/O, daemon calls) in dedicated hooks or services, not inside presentational components.
- Run the formatter/linter (`pnpm run format` / `pnpm run lint`) before committing.

### Documentation

- Write docs in Markdown under `docs/src/`.
- Reference concrete file paths and binaries when possible.
- Prefer short, scannable sections with headings and bullets rather than long walls of text.

## Testing and Validation

### Rust

- Run tests from the `backend/` workspace root:

  ```bash
  cd backend
  cargo test
  ```

- Run smoke tests that bind local sockets (relay/rendezvous metrics):

  ```bash
  cd backend
  cargo test -p soma-relay --test smoke -- --ignored
  cargo test -p soma-rendezvous --test smoke -- --ignored
  ```

- Add tests alongside the code they exercise (same crate, nearby module).
- Keep tests deterministic; avoid relying on external network or timing unless absolutely necessary.

### Desktop Apps

- Use `pnpm` for installs and scripts:

  ```bash
  cd desktop/app
  pnpm install
  pnpm --filter @soma/soma run typecheck
  pnpm --filter @soma/soma run lint
  ```

  and similarly for `desktop/app/tapia` (use `--filter @soma/tapia`).

- Keep unit tests small and focused; integration tests should run against local daemons where feasible.

### Manual Flows

- For end-to-end checks:
  - Run `soma-daemon` from `backend/`.
  - Start `desktop/app/soma` or `desktop/app/tapia` in dev mode.
  - Exercise join flows, class navigation, and basic messaging.

## Networking Services (Relay + Rendezvous)

Soma uses two lightweight libp2p infrastructure services to improve discovery and connectivity:

- **Relay** (`soma-relayd` / `backend/crates/relay`): Circuit Relay v2 service for NAT traversal and relayed connectivity.
- **Rendezvous** (`soma-rendezvousd` / `backend/crates/rendezvous`): Rendezvous discovery service for peer registration and discovery.

### Identity Persistence (Peer ID Stability)

Both services persist a libp2p keypair so that their Peer ID stays stable across restarts.

- Env var: `SOMA_DATA_DIR`
- Default paths:
  - Relay: `./data/relay/identity.key`
  - Rendezvous: `./data/rendezvous/identity.key`
- Key algorithm: ECDSA (for all services using libp2p identities)

Deleting these files will cause a new identity + new Peer ID on next start.

### Transports and Listen Addresses

Relay and rendezvous listen on multiple transports to maximize reach across networks:

- **TCP**: compatibility baseline
- **QUIC (UDP)**: faster handshakes / often better NAT behavior, but UDP can be blocked
- **WebSocket (WS)**: helpful on restrictive networks and for web-like environments

Current default listen addrs (multiaddr form):

- Relay:
  - `/ip4/0.0.0.0/tcp/4001`
  - `/ip4/0.0.0.0/udp/4001/quic-v1`
  - `/ip4/0.0.0.0/tcp/4003/ws`
- Rendezvous:
  - `/ip4/0.0.0.0/tcp/4004`
  - `/ip4/0.0.0.0/udp/4004/quic-v1`
  - `/ip4/0.0.0.0/tcp/4004/ws`

Note: the Axum HTTP server is used only for health/metrics and is configured separately via CLI (see below).

### Swarm Builder (Typestate Order)

`soma-net` provides a shared `build_swarm` helper (used by relay/rendezvous). libp2p’s `SwarmBuilder` uses a typestate API, meaning the order of calls matters when composing transports.

The supported order is:

`TCP -> QUIC -> DNS -> WebSocket -> Behaviour`

If QUIC is not included in the transport stack, attempting to `listen_on` a `/udp/.../quic-v1` address will fail with `MultiaddrNotSupported(...)`.

### Running Locally

From `backend/`:

- Relay:
  - `cargo run --bin soma-relayd -- --http-addr 0.0.0.0:8081`
- Rendezvous:
  - `cargo run --bin soma-rendezvousd -- --http-addr 0.0.0.0:8082`

### Metrics

Both services expose:

- `GET /healthz` → `"ok"`
- `GET /metrics` → Prometheus text format

Default HTTP endpoints:

- Relay metrics: `http://127.0.0.1:8081/metrics`
- Rendezvous metrics: `http://127.0.0.1:8082/metrics`

Service-specific counters:

- Relay (prefix `relay_`):
  - `relay_reservations_total{result=...,status=...}`
  - `relay_circuits_total{result=...,status=...}`
  - `relay_listen_events_total`
- Rendezvous (prefix `rendezvous_`):
  - `rendezvous_discover_total{result=...}`
  - `rendezvous_registrations_total{result=...}`
  - `rendezvous_listen_events_total`

## Peer Connectivity (Daemon + Bot)

For how peers (`soma-daemon`, `soma-botd`) use mDNS, rendezvous, and relay client behaviour (and the relevant CLI flags), see `docs/src/architecture/peer-connectivity.md`.

## Design and Structure Guidelines

### Backend (Rust)

- Organize crates by responsibility:
  - `core` – domain logic and core types.
  - `storage` – persistence and data models.
  - `net` – libp2p and networking behaviours.
  - `api` – local IPC/API surface.
  - `agent` – high-level orchestration of the local agent.
  - `common` – small utilities and shared types.
- Keep public APIs narrow; avoid leaking internal types across crate boundaries unless necessary.
- Prefer composition over inheritance-like patterns; wire behaviours together in the binaries (`bins/*`) rather than deeply coupling crates.

### Desktop (Electron/React)

- Treat `desktop/app/soma` and `desktop/app/tapia` as separate products sharing a backend daemon.
- Keep Electron main-process code (window management, protocol handlers, daemon bootstrap) separate from renderer React code.
- Route all network operations through the local daemon; do not introduce direct server calls from the UI unless explicitly required.
- Local state:
  - UI state lives in React (components, hooks).
  - Persistent or shared state that mirrors daemon state should be derived from daemon APIs, not duplicated business logic in the UI.

### Server

- Keep server crates focused on infrastructure concerns (relay, rendezvous, hosted bots, APIs).
- Do not embed client-only logic (UI assumptions, desktop paths) into server code.
- Prefer configuration via environment variables and config files to hardcoding addresses or credentials.

## General Practices

- Favor small, focused pull requests.
- Maintain existing patterns where they are reasonable; introduce new patterns deliberately and document them.
- Update documentation (`docs/src/`) when you add or significantly change a feature, especially if it affects onboarding or architecture.
- If you are unsure where to place new code, bias toward the smallest scope (module or crate) that can own the responsibility and update this document if you establish a new pattern.
