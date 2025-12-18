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
