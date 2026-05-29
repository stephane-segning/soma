# SOMA

Local-first workspace platform that ships as **two artifacts**: one Tauri V2 desktop app and one server binary. Both are thin shells around the same shared Rust crates — the desktop embeds them in its `src-tauri` process via a small stack of `desktop-*` crates, the server runs them as subcommands of a unified binary. Long-running availability is provided by the server binary running in bot mode.

## Architecture (target)

Two build artifacts. One source tree.

**Desktop** — `desktop/desktop-app/`: the only desktop app, a **Tauri V2** shell. React + TypeScript renderer (Vite) over a Rust `src-tauri` host process. The host embeds the peer + agent runtimes in-process (via the `desktop-daemon` / `desktop-agent` crates) and exposes them to the renderer through Tauri commands. No separate daemon binaries, no Unix-socket IPC, no spawning of child processes. (The legacy Electron app + its napi `soma-node` addon were removed once the Tauri shell reached parity.)

**Server** — `somad`: the only server binary. Subcommands select behavior; subcommand options pass mode-specific configuration. Same shared crates the desktop host embeds; mode is purely a runtime concern.

```
somad bot         [--http-addr ...] [--db-path ...] [--mode bot|admin] [--listen-addr ...]
somad relay       [--http-addr ...] [--data-dir ...]
somad rendezvous  [--http-addr ...] [--data-dir ...]
somad bff         [--http-addr ...] [--provider ...]
somad all         --config server.toml      # composes multiple modes in one process
```

Subcommands map to the existing service crates: `bot` uses `crates/peer` + `crates/membership` + `crates/storage`; `relay` uses `crates/relay`; `rendezvous` uses `crates/rendezvous`; `bff` uses `crates/bff`; `all` is the orchestrator (replaces the former `serverd`).

What's gone in the fully-collapsed target:

- `backend/bins/daemon/`, `backend/bins/agentd/` — desktop runtimes moved to `crates/daemon/` and `crates/agentd/` (lib-only). The desktop host crates consume them; no standalone binaries.
- `backend/bins/botd/`, `backend/bins/relayd/`, `backend/bins/rendezvousd/`, `backend/bins/bffd/`, `backend/bins/serverd/` — replaced by `backend/bins/somad/` with subcommands.
- `desktop/soma/` (`soma`) — the legacy Electron app, removed in favour of the Tauri shell at `desktop/desktop-app/`.
- `backend/crates/soma-node/` (`@soma/node`) — the napi-rs addon that bridged the embedded runtimes into Electron main. Gone with Electron; the Tauri host links the runtime crates directly.
- `desktop/tapia/` — merged into the desktop app's `/practice` route.
- `desktop/desktop-proto/` (`@soma/proto`) — gRPC TS codegen unnecessary; the desktop host calls the runtimes directly and `@soma/sdk` types are generated from the Rust command graph via specta. libp2p protobuf stays Rust-only.
- `daemon-process-manager`, splash-blocks-on-daemon-Status gate, socket-path config plumbing in `@soma/desktop-config`.
- All LaunchAgent / systemd-user-unit infrastructure for the desktop side; the embedded peer lives in-process.
- All install/uninstall `sudo` *for the default sudoless install path*. We do publish `.deb` + `.dmg` for users who prefer a conventional installer (apt is sudo'd, drag-from-`.dmg` is not), but `.AppImage` / `.zip` remain the sudoless defaults.
- The macOS `.pkg` path (replaced by a notarized `.dmg` + `.zip` pair).
- The `__SOMA_*` plist token + post-install perl rewrite.
- The `xattr -dr com.apple.quarantine` band-aid (replaced by Developer ID signing + notarization).
- Five per-service Docker images → one `somad` image.

Always-on peer model: the desktop peer is online only while Soma is open. Tray-when-window-closed on macOS keeps the peer live during a user session. Long-term availability for a space is provided by `somad bot` running as a space mirror (see "Bots and always-on availability" below).

## Migration status

Pre-prod refactor. Breaking changes are fine; there is no backwards-compatibility surface to preserve.

- [x] P0 — AGENTS.md rewritten to fully-collapsed target architecture
- [x] P1 — `soma-daemon` and `soma-agentd` library-ified (binaries keep working through thin shims)
- [x] P2 — Tapia merged into Soma as `/practice`; `desktop/tapia/` deleted
- [x] P3a — `backend/crates/soma-node` napi-rs addon scaffolded, embeds both runtimes
- [x] P3b — Proof-of-pattern: `DaemonHandle` + `SomaHandle.status()` end-to-end through napi
- [x] P3c — `@napi-rs/cli` build pipeline wired; `@soma/node` consumed by `desktop/soma`
- [x] P3d — Every daemon + agent method extracted into `DaemonHandle` / `AgentHandle`; exposed via napi
- [x] P4 — Soma main rewritten to call addon directly; daemon-process-manager / splash gate / socket config removed
- [x] **Server-binary collapse** (was P5) — `bins/{botd,relayd,rendezvousd,bffd,serverd}` deleted; one `somad` binary with subcommands (`bot`, `relay`, `rendezvous`, `bff`, `all`); one Dockerfile, one image
- [x] P5 — Streaming: daemon `stream_events` wired through napi `ThreadsafeFunction`; renderer reacts via `DomainEventsService`. `chat_stream` deferred (no consumer — Soma uses OpenAI HTTP)
- [x] P6a — Packaging cleanup: sudoless user-domain install at `~/Applications`, SHA256SUMS published with `desktop-v*` releases, obsolete `desktop/packaging/` + `release.yml` (bundle workflow) deleted. (The install/uninstall bootstrap scripts originally introduced here were retired once notarized macOS `.dmg`/`.zip` + Linux `.deb`/`.AppImage` made `curl | bash` unnecessary; users download directly from the release.)
- [x] P6b — Developer ID code signing + notarization: `electron-builder.yml` has `notarize: true`; `release-desktop.yml` reads `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (content, materialized to `$RUNNER_TEMP/AuthKey.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID` from repo secrets; ad-hoc `codesign --sign -` + `ditto` rezip step removed
- [x] P7 — CI matrix dedup: `.github/targets.json` is the single `(os, arch)` source, consumed via a `targets` job + `fromJSON` in the release workflow(s). Dead `release-daemons.yml` + its sole-consumer `cargo-cross-build` composite action removed. `docker-backend.yml` renamed to `release-server.yml` to match the doc.
- [x] P8 — **Tauri migration + Electron removal.** New desktop app at `desktop/desktop-app/` (Tauri V2 shell) replaces the Electron app. The runtimes are embedded in `src-tauri` via the `desktop-*` Rust crates; `@soma/sdk` drives the renderer over Tauri commands today (HTTP/SSE BFF via `desktop-bff` later). `desktop/soma/` (Electron app), `backend/crates/soma-node/` (napi addon), `desktop/desktop-proto/` (`@soma/proto`), `release-desktop.yml`, and all `electron-builder*` / `electron.vite` config were deleted. **A Tauri release pipeline is not yet wired** — the desktop currently has no published-artifact path; the docs landing-page download links point at the now-stale Electron assets until a Tauri release workflow lands.

When this document says "today" or describes current behavior in present tense, treat it as the *intended* behavior in the target architecture — verify against the code if you need to make a load-bearing decision.

## Repository Layout

- `backend/` — Rust workspace.
  - `crates/daemon/` (`soma-daemon`) — desktop peer runtime, library only. Embedded by the Tauri host (`desktop-daemon`); no standalone binary.
  - `crates/agentd/` (`soma-agentd`) — desktop agent runtime, library only. Embedded by the Tauri host (`desktop-agent`); no standalone binary.
  - `crates/peer/` — libp2p peer behaviour, event types, request/response protocols.
  - `crates/agent/` — local LLM/embed/Yjs reconciliation runtime.
  - `crates/storage/` — repositories + schema; consumes the `.cstack` schema via `cratestack-rusqlite`.
  - `crates/core/` — domain types, `DbFactory`, telemetry, shared utilities.
  - `crates/net/` — libp2p swarm builder (typestate transport order: TCP → QUIC → DNS → WS → Behaviour).
  - `crates/membership/`, `crates/api/`, `crates/cache/`, `crates/common/`, `crates/metrics/`, `crates/vdfs/`, `crates/relay/`, `crates/rendezvous/`, `crates/bff/`, `crates/proto-build/` — unchanged in role.
  - `bins/somad/` — the **only** server binary. Subcommand-dispatch entry point (`bot`, `relay`, `rendezvous`, `bff`, `all`). Mode-specific argument parsing lives per-subcommand under `bins/somad/src/commands/`.
- `desktop/` — the Tauri V2 desktop app + its supporting Rust crates + shared TS packages.
  - `desktop/desktop-app/` — the Tauri V2 app (`@soma/desktop-app`). React/Vite renderer under `src/`; the Rust host under `src-tauri/` (binary crate `desktop-app`). Composes `@soma/ui`'s `DesktopShell`, drives data through `@soma/sdk`, and embeds the runtimes via the `desktop-*` crates.
  - `desktop/desktop-core/`, `desktop/desktop-services/`, `desktop/desktop-daemon/`, `desktop/desktop-agent/`, `desktop/desktop-api/`, `desktop/desktop-commands/`, `desktop/desktop-bff/` — the Rust crates that compose into the Tauri host (see "Desktop App" below).
  - `desktop/desktop-ui/` — shared React components (`@soma/ui`), subpath-imports only (`@soma/ui/components/*`, `@soma/ui/hooks/*`, etc.; no root export).
  - `desktop/desktop-sdk/` — typed client SDK (`@soma/sdk`): one API facade, two transports (Tauri commands today, HTTP/SSE BFF later). Wire types live in `src/bindings/` (specta-generated from the Rust command graph).
  - `desktop/desktop-config/` — stage detection + path normalization (`@soma/desktop-config`).
  - `desktop/desktop-editor/` (`@soma/editor`), `desktop/desktop-data/` (`@soma/desktop-db`), `desktop/desktop-icons/` (Rust icon crate), `desktop/desktop-e2e/` (`@soma/e2e` — Cucumber × Playwright over Storybook) — supporting packages.
- `proto/` — libp2p wire formats (Rust-only; the TS `@soma/proto` codegen package was removed with Electron).
- `docs/` — VitePress docs (`@soma/docs`).
- `deploy/` — Helm charts and infrastructure manifests for server backends.
- `prd/` — product requirements.
- `.github/workflows/` — CI (`test.yml`) + release pipelines (`release-server.yml` for the server-binary matrix, `release-pages.yml` for docs + Storybook). The Tauri desktop release pipeline is not yet wired.

Where to put new code:

- Domain logic → `backend/crates/core` or a focused new crate.
- Storage queries → `backend/crates/storage` (repository modules per aggregate).
- Peer wire/event behaviour → `backend/crates/peer`.
- A new desktop capability the renderer calls → add a transport-agnostic handler in `desktop/desktop-api`, wrap it as a `#[tauri::command]` in `desktop/desktop-commands` (and, for the remote path, an HTTP route in `desktop/desktop-bff`); the type flows to `@soma/sdk` via specta.
- Renderer UI → `desktop/desktop-app/src`.
- Reusable UI → `desktop/desktop-ui` (and update its subpath exports).

## Terminology: VDF

**VDF** is a **cache-only peer role** that improves availability/latency by fetching and caching content-addressed data.

- VDFs **never accept user uploads** and are **not a source of truth** for user-created blobs.
- VDFs may cache in-memory (LRU/TTL), on disk, or via an external cache (Redis); writes are allowed only as a side-effect of *fetching/verifying* content.
- VDFs must **verify bytes match the claimed CID** before serving/persisting.
- The crate is `soma-vdfs` for historical reasons; "VDF" is the canonical term in docs and conversations.

## Tech Stack

- **Rust** — the Tauri desktop host (`src-tauri` + `desktop-*` crates) and all server backends. New crates default to **edition 2024**; existing crates migrate opportunistically.
- **Tauri V2** — desktop shell. Rust host process exposes `#[tauri::command]`s to the renderer; plugins (`fs`, `dialog`, `shell`, `os`, `process`, `store`, `log`, `opener`, `deep-link`, `single-instance`, `updater`, `window-state`) provide native capabilities. `tauri-specta` walks the command graph to emit the `@soma/sdk` TypeScript bindings.
- **CrateStack (`cratestack-rusqlite`)** — schema-first SQLite layer. One `.cstack` schema is the source of truth for the embedded database; generated via `include_embedded_schema!`. Sync API, bundled SQLite, no tokio on the data path. Repo at `~/dev/cratestack`.
- **Tauri + React + TypeScript** — desktop UI. `strict` TS. pnpm workspace.
- **Cargo workspace**, `resolver = "3"`, all third-party versions under `[workspace.dependencies]` in root `Cargo.toml`.
- **Tokio** — single runtime per process. The Tauri host owns the desktop runtime; server binaries each own theirs.
- **libp2p** — peer transport (TCP + QUIC + WebSocket), circuit-relay v2 for NAT traversal, rendezvous for discovery.
- **Tonic / Prost** — gRPC + protobuf for libp2p wire formats. The renderer talks to the host over Tauri commands (not gRPC); types are generated from the Rust command graph via specta.
- **Server storage** — SQLx AnyPool (Postgres or SQLite via `SOMA_DATABASE_URL`) for `somad bot` until CrateStack migration lands as a separate phase.
- **`tracing`** for logs; `mimalloc` as the global allocator in all backends.

## The Desktop Host (`src-tauri` + `desktop-*` crates)

The Tauri host is the boundary between Rust and the renderer. It is composed from a small stack of focused crates rather than one monolith:

- `desktop-app` (`desktop/desktop-app/src-tauri/`) — the **binary**. A thin shell: builds Tauri-managed state, registers plugins, registers the command handlers, owns the event-stream lifecycle, and runs the app loop. All business logic lives in the library crates below. Mirrors the role the old Electron `main/index.ts` played.
- `desktop-core` — shared types, errors, and event payloads.
- `desktop-services` — non-runtime host services: logger, app store, blob protocol, upload-payload store, event broadcasters.
- `desktop-daemon` — owns the in-process `soma-daemon` handle; exposes a high-level `DaemonClient` API and a daemon→renderer event bridge.
- `desktop-agent` — owns the in-process `soma-agentd` handle plus the OpenAI-compatible chat/embed/rerank client.
- `desktop-api` — **transport-agnostic** command handlers. The single source of business behaviour for the client surface.
- `desktop-commands` — the Tauri presenter: thin `#[tauri::command]` adapters over `desktop-api` handlers. `tauri-specta` walks these to emit the `@soma/sdk` bindings.
- `desktop-bff` — an HTTP/SSE presenter over `desktop-api`, mirroring the command surface for `@soma/sdk`'s `httpTransport` so the renderer can run against a remote backend later.

Conventions:

- **One presenter per transport, one shared handler layer.** New behaviour goes in `desktop-api`; `desktop-commands` and `desktop-bff` are thin adapters. Never duplicate logic across presenters.
- **Embedded runtimes, single Tokio runtime per process.** The host links `soma-daemon` + `soma-agentd` as libraries and runs them in-process; no child processes, no sockets, no napi.
- **Streaming** uses Tauri events: the daemon event bridge and agent runtime event poll push to the renderer; both are stopped explicitly on `RunEvent::ExitRequested` to avoid racing shutdown.
- **TypeScript types are generated** from the Rust command graph via specta / `tauri-specta` into `desktop/desktop-sdk/src/bindings/`; the renderer consumes them through `@soma/sdk`, never by hand-writing wire types.
- One SQLite database shared by both runtimes. Schema declared in a single `.cstack` file consumed via `include_embedded_schema!`.

## Storage (CrateStack)

One `.cstack` schema describes the embedded database. Lives at `backend/crates/storage/schema.cstack` (or `backend/crates/soma-schema/schema.cstack` — finalized in P3).

- The **desktop host** consumes the schema via `cratestack::include_embedded_schema!("schema.cstack")`.
- **`somad bot` stays on SQLx for now.** Migrating botd's Postgres + SQLite paths to CrateStack is its own phase; the one-macro-per-crate constraint (`include_server_schema!` vs `include_embedded_schema!`) needs a deliberate design choice for that.
- Single database file per install at `~/Library/Application Support/Soma/soma.db` on macOS, `~/.local/share/soma/soma.db` on Linux. Stage-specific (`-dev`, `-staging`) suffixes via `@soma/desktop-config`.
- Tables (target schema — verify against the `.cstack` file): `spaces`, `space_memberships`, `join_decisions`, `join_requests`, `issuer_capabilities`, `mailbox`, `documents`, `pages`, `blobs`, `blob_refs`, `peer_public_keys`, plus agent-runtime tables (chat sessions, embeddings, etc.) that previously lived in `agentd.db`.
- `cratestack-rusqlite` provides the sync data API; the host wraps reads/writes in `spawn_blocking` only where contention is real (it usually isn't — rusqlite is fast).
- No SQLx migrations directory on the desktop side; CrateStack generates schema from the `.cstack` source. Migration is a separate concern handled at host start (DDL + version table).

## Desktop App (Soma)

Single Tauri V2 app at `desktop/desktop-app/`. Renderer under `src/` (React/Vite); Rust host under `src-tauri/` (see "The Desktop Host" above). Tapia merged in as a `/practice` route.

Process model:

- Host process (`src-tauri`): embeds the runtimes, registers Tauri commands + plugins, owns the daemon/agent event streams, runs the app loop.
- Renderer: React + `react-router`. Data flows through `@soma/sdk` (`createBackend(tauriTransport())`, see `src/lib/backend.ts`) — there is **no Redux/RTK** in the Tauri renderer; the SDK facade is the single data surface. XState for the typing-practice state machine. No Zustand; do not introduce TanStack Query.
- No daemon spawn, no socket discovery. Cold-start = host start + runtime init + first paint (a native splash covers init; the main window reveals once ready).

Conventions:

- Filenames are **kebab-case** for `.ts`/`.tsx`.
- IDs are **CUIDs**, not UUIDs.
- `@soma/ui` has **no root export** — import via subpaths (`@soma/ui/components/*`, `@soma/ui/hooks/*`, `@soma/ui/utils/*`, `@soma/ui/yoopta`, `@soma/ui/types`). The shell is composed from `@soma/ui`'s `DesktopShell` and its rail/panel primitives.
- Routing: `react-router` core (`src/routes/router.tsx`), not `react-router-dom`.
- Frameless window: `decorations: false`, `titleBarStyle: "Overlay"`, `hiddenTitle: true` in `tauri.conf.json`. Drag with `data-drag-region`, opt out with `data-no-drag`.
- Deep links: `soma://...` via `tauri-plugin-deep-link`; secondary launches routed through `tauri-plugin-single-instance` (`src-tauri/src/startup/deep_link.rs`).
- Window state persists via `tauri-plugin-window-state`; key/value app state via `tauri-plugin-store`.
- Logging: `tauri-plugin-log` + the `desktop-services` logger; writes to the OS logs dir.

State and data:

- `@soma/sdk` is the data surface: `backend.spaces.list(...)`, etc. New endpoints come from `desktop-api` handlers surfaced through `desktop-commands`; the renderer calls them via the typed facade.
- Side effects (I/O, command calls) live in dedicated hooks or services, not in components.

Blob protocol:

- `soma-blob://...` URL scheme registered by the host (`desktop-services::blob_protocol`); the handler reads bytes through the embedded daemon directly — no gRPC roundtrip.

Agent runtime configuration:

- Source of truth: the Tauri store (`tauri-plugin-store`) via the host's config source (`src-tauri/src/agent_config_source.rs`), surfaced to the renderer through `@soma/sdk`.
- Default provider: OpenAI-compatible at `http://127.0.0.1:11434/v1` (Ollama-style).
- Supported provider kinds: `agentd` (the embedded agent runtime), `openai-compatible`.
- Provider/model docs: `docs/src/development/agentd-models.md`.

Practice route (merged Tapia):

- Pure renderer surface; no host command dependency required (typing practice is local-only).
- Uses XState for the typing state machine, Motion for cursor/feedback animations, a stable grapheme + diff library, `simple-keyboard` for the on-screen keyboard.

## Server: `somad`

One binary, subcommand-dispatched. Each subcommand wraps the relevant service crate and takes its own flags. All subcommands share: `clap` for CLI + env config, `mimalloc` for allocation, `tracing` for logs (via `soma_core::telemetry::init_tracing`).

Top-level UX:

```
somad <SUBCOMMAND> [OPTIONS]
somad --help
somad <SUBCOMMAND> --help
```

Subcommands are documented with `--help`; flag names within each subcommand are stable contracts. Adding a new mode = adding a new subcommand module under `bins/somad/src/commands/`.

### `somad bot` — peer + bot

The only headless peer. Absorbs the former `soma-daemon` server-side use case.

Two operating sub-modes via `--mode bot|admin`:

- **`bot` (default)** — peer + read-only HTTP (`/info`, `/healthz`, `/metrics`). No `/v1/*` endpoints. Auto-approves joins **only** when it holds a valid issuer capability for the space; otherwise records the request for manual approval elsewhere.
- **`admin`** — peer + authenticated control plane (`POST /v1/join/request`, `GET /v1/join/requests`, `POST /v1/join/decide`, `POST /v1/space/revoke`, `POST /v1/space/issuer-capability`, etc.). HTTP write endpoints must be authn/authz-gated.

Internals (under `bins/somad/src/commands/bot/`):

- Runtime + dispatcher wiring; peer event handlers (`MetricsHandler` covers all `PeerEventKind`s; `LoggingHandler` is selective); Prometheus metrics; join decider.
- Add new handlers by implementing `PeerEventHandler` and registering in `build_dispatcher`.
- Storage: SQLx AnyPool via `soma_core::db::DbFactory`. `--db-path` / `SOMA_DATABASE_URL`; defaults to `./botd.db` SQLite. Migrations under `backend/crates/storage/migrations`, embedded with `sqlx::migrate!`; startup fails if migration fails.
- Join decider: auto-approves only on valid issuer capability (role/expiry enforced) and signs the membership capability with the bot's libp2p identity key.

### `somad relay`

libp2p circuit relay v2 + Axum HTTP (`/healthz`, `/metrics`). Uses `crates/relay`.
Metrics prefix `relay_`: `relay_reservations_total`, `relay_circuits_total`, `relay_listen_events_total`.
Default listen addrs: `/ip4/0.0.0.0/tcp/4001`, `/ip4/0.0.0.0/udp/4001/quic-v1`, `/ip4/0.0.0.0/tcp/4003/ws`.
Identity persists at `${SOMA_DATA_DIR}/relay/identity.key` (ECDSA).

### `somad rendezvous`

libp2p rendezvous discovery + Axum HTTP (`/healthz`, `/metrics`). Uses `crates/rendezvous`.
Metrics prefix `rendezvous_`: `rendezvous_discover_total`, `rendezvous_registrations_total`, `rendezvous_listen_events_total`.
Default listen addrs: `/ip4/0.0.0.0/tcp/4004`, `/ip4/0.0.0.0/udp/4004/quic-v1`, `/ip4/0.0.0.0/tcp/4004/ws`.
Identity persists at `${SOMA_DATA_DIR}/rendezvous/identity.key` (ECDSA).

### `somad bff`

LLM BFF for provider integrations over HTTP. The only subcommand that does **not** use libp2p (optional diagnostic libp2p peer can be enabled via flag). Uses `crates/bff`.

### `somad all`

Compose multiple subcommands in one process via `--config server.toml`. Replaces the former `serverd`. The config file declares which modes to run and which options each takes; one process binds the union of ports, sharing the Tokio runtime + telemetry.

### Swarm builder

`soma-net::build_swarm` uses libp2p's typestate `SwarmBuilder`. Order matters: **TCP → QUIC → DNS → WebSocket → Behaviour**. Without QUIC in the stack, `listen_on(/udp/.../quic-v1)` fails with `MultiaddrNotSupported(...)`.

## Bots and always-on availability

The desktop peer is online only while Soma is open. Permanent availability for a space is provided by `somad bot` running as a **space mirror**:

- Maintains a local `blob-cache-dir` (cache-only, populated via fetch).
- Attempts to keep all referenced CIDs for configured spaces present locally.
- Learns "what to cache" via:
  - **Announce-driven** — when a peer stores a blob and writes a Yoopta reference, it publishes a lightweight "blob announce" (`space_id + cid + mime + size`). Mirror bots enqueue a fetch.
  - **Crawl/reconcile** — periodic scan of space state; extract references; fetch missing; optionally evict unreferenced with TTL.
- Fetch strategy: try any reachable peer (peerstore/Identify, rendezvous, relay) until one serves the CID; DB-backed retry queue (mailbox-style) for transient failures.
- Cache policy: prefer retention for referenced blobs; eviction bounded by size/TTL/"unreferenced for N days". Never accepts uploads; the cache is filled only by pulling verified bytes (CID match).

## Blobs (content-addressed, host-owned)

Binary assets (files, images, attachments, Yoopta-related assets) are **content-addressed objects** stored outside Yjs/Yoopta. Collaborative documents store **references** to blobs, never bytes.

Roles and rules:

- The **embedded peer in the desktop host** is the source of truth for user-created blobs.
- `somad bot` is **cache-only** for blobs in both `bot` and `admin` modes (writes allowed only as a side-effect of fetching from the network; never accepts user upload).
- Blob identity is a CID computed from bytes (e.g. `sha256`); storage is keyed by CID (content-addressed).

Upload (host-internal):

- Entrypoint: the renderer invokes an upload command (`@soma/sdk` → `desktop-commands` → `desktop-api`) with `{ spaceId, bytes, contentType, name, yooptaContext? }`.
- The host persists bytes into the configured blob pool (space-scoped layout) and records minimal metadata (size, content type, original name) in SQLite.
- A peer event is emitted **only** when the blob is associated with Yoopta content (i.e. upload includes Yoopta context like `document_id` / `node_id`). Non-Yoopta blobs are stored but generate no Yoopta-related events.

Read and serve:

- Renderers load bytes via the `soma-blob://...` URL scheme (kept for URL stability).
- The Tauri blob-protocol handler (`desktop-services::blob_protocol`) reads bytes through the embedded daemon — direct, no IPC, no gRPC.

Network distribution (fetch + cache):

- Peers retrieve blobs from each other by CID over libp2p (`/soma/blob/1` request/response).
- When a Yoopta document starts referencing a blob, the writer publishes a "blob availability hint" so other peers know what to fetch/cache.
- `somad bot` as a mirror participates in serve + on-demand fetch + LRU/TTL eviction.

Non-goals / guardrails:

- No HTTP upload endpoints in `somad bot` in any mode.
- No network "push bytes to bot" protocol; blob transfer is pull-based by CID.
- Do **not** embed multiaddrs in Yoopta content; do **not** assume every user has a bot — references must resolve via any reachable peer.

Yoopta integration:

- References include at least `cid`, `mime`, `size`, optional `name`, plus renderer-specific fields.
- Dialing happens at runtime: peers fetch by CID using `/soma/blob/1` from any reachable peer that has it.

Security and limits:

- Validate declared sizes/content types and enforce max blob sizes at ingress (host command API) and egress (network transfer).
- **Always verify bytes match the CID before persisting/serving.**
- Treat all remote blobs as untrusted; no automatic execution/rendering without UI sandboxing.

## Joins, Memberships, Capabilities

Join MVP has two planes:

- **Transport**: `soma-peer` (libp2p request/response). Protocols `/soma/join/1` and `/soma/join-decision/1`.
- **Policy + persistence**: `soma-membership` + SQLx (or CrateStack on the desktop side) repositories — `join_requests`, `join_decisions`, `space_memberships`, `mailbox`.

Flows:

1. **Single-target join (decider online)**: requester sends `JoinRequest` over `/soma/join/1`; decider records `join_requests` (pending), returns immediate `JoinDecision` (pending or approved). On approval, decider records `join_decisions` + upserts `space_memberships` and sends signed `JoinDecision` over `/soma/join-decision/1`. Requester persists the membership.
2. **Multi-target retry (owner offline, delegated bot online)** *(not yet implemented)*: requester tries candidate deciders in order (owner first, then delegated bots) until one responds; retry queue in `join_requests` with `is_outgoing=1`.
3. **Mailbox fallback (requester offline)**: decider's outbound `SendJoinDecision` fails → enqueue in `mailbox` (kind=`join_decision`, status=`queued`) → periodic sweep + on-connect drain retries delivery; ack on receipt; `mailbox.mark_done`.

Open security work (currently provisional):

- [ ] **Verify `MembershipCapability.signed`** on receipt at the daemon using the issuer public key from libp2p Identify. If `issuer != owner`, verify the issuer delegation chain (owner → issuer capability → membership).
- [ ] **Verify `IssuerCapability.signed`** (owner signature) and enforce expiry/allowed roles consistently before auto-approving.
- [ ] **Canonical signing format**. Current signing uses CBOR via `ciborium`, but canonical CBOR is not guaranteed. Move to a canonical scheme before relying on cross-version/cross-implementation signatures.
- [ ] **Space genesis artifact**. Today `spaces.owner_peer_id` is DB-local metadata only; add an owner-signed record other peers can verify.
- [ ] **Issuer delegation lifecycle** with auditable issuance/rotation from both the in-process desktop command surface and admin HTTP.
- [ ] **Space membership revocation/leave** end-to-end.
- [ ] **Space roster / discovery** helpers exposed from the desktop host (`listSpaceMembers`, `discoverSpaces`).

## Storage schema (target)

A single SQLite database per install, schema declared in one `.cstack` file. Tables (ER overview):

- `spaces(space_id)` — display_name, created_at.
- `space_memberships(space_id, subject_peer_id)` — role, issuer_peer_id, issued_at, expires_at, capability blob.
- `join_decisions(decision_id)` — space_id, subject_peer_id, decision enum, reason, created_at, capability blob (audit).
- `join_requests(request_id)` — incoming (approver-side, `is_outgoing=0`, `status=pending`) and outgoing (requester-side, `is_outgoing=1`, retry state).
- `issuer_capabilities(space_id, delegate_peer_id)` — issuer_peer_id, issued_at, expires_at, capability blob.
- `mailbox(id)` — kind, space_id?, subject_peer_id?, status (queued|leased|done|dead), attempts, available_at, lease_until?, leased_by?, payload blob, created_at.
- `documents(space_id, document_id)` — Yoopta JSON content (mutable).
- `pages(space_id, page_id)` — page navigation metadata (title + parents).
- `blobs(space_id, cid)` — blob metadata (size/mime/name, timestamps).
- `blob_refs(space_id, cid, document_id)` — document→blob references (for listing + safe GC).
- `peer_public_keys(peer_id)` — Identify public keys observed for peers.
- Agent tables (chat sessions, embeddings, etc.) — folded in from the former `agentd.db`.

`somad bot` keeps its current SQLx migrations at `backend/crates/storage/migrations` until that runtime is migrated to CrateStack.

## Dependency Policy

### Rust

- Third-party dependency versions are declared **only** in the repo-root `Cargo.toml` under `[workspace.dependencies]`.
- All workspace crates depend on third-party crates using `{ workspace = true }`. Add optional capabilities with `features = [...]` on the workspace dep in the leaf `Cargo.toml`.
- Do not add `version = "..."` for third-party crates anywhere except the root `Cargo.toml`.
- Server backends: `clap` for CLI/env config, `mimalloc` as the global allocator.
- Desktop host: same tracing conventions, no clap; config comes from the Tauri store / renderer commands.

### TypeScript / pnpm

- pnpm workspace at `pnpm-workspace.yaml`; pnpm 9.
- Strict TypeScript everywhere.
- Built-only dependencies (esbuild, native build tooling) pinned in `pnpm.onlyBuiltDependencies`.

## Code Style

### Naming conventions

Applies to every package in this repo — TS, Rust, and config files alike.

- **Files** — `kebab-case` for `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.md`, `.json`, shell scripts. Rust source files keep their conventional `snake_case` per `rustfmt`.
- **JavaScript / TypeScript variables and functions** — `camelCase`.
- **Rust variables and functions** — `snake_case` (rustfmt enforces it; don't fight).
- **Type names, classes, React components** — `PascalCase` regardless of language. JSX requires component identifiers to be PascalCase even when the file holding them is kebab-case (e.g. `left-inner-rail.tsx` exports `LeftInnerRail`).
- **Constants** — `SCREAMING_SNAKE_CASE` when the value is genuinely compile-time-constant; otherwise treat as a normal variable.

When renaming files to conform, use `git mv` (preserves history) and update every importer in the same commit — don't leave dangling imports.

### Rust

- Stable Rust; `rustfmt`-formatted. New crates default to edition 2024.
- Self-describing names; avoid single-letter identifiers except for well-understood indices.
- Small, cohesive modules.
- `tracing` for logs; no `println!` in production code.
- Rich error types (thiserror / anyhow). Reserve `panic!` for truly unrecoverable cases — a panic inside a Tauri command should be converted to a typed error and surfaced to the renderer, not left to abort the host.
- Explicit async boundaries; never block inside async tasks.
- Traits-first abstraction: define behavior behind traits, prefer trait impls on small structs/newtypes, default methods on traits over separate helper modules. Free functions only for pure, stateless utilities.

### TypeScript / React (desktop app)

- Function components with hooks; keep side effects in services/hooks, not components.
- Use existing hooks/state containers before adding new global state mechanisms.
- `@soma/sdk` is the data surface (Tauri transport); XState for finite state (practice typing); do not introduce Zustand or TanStack Query.
- **Prefer Biome** for formatting + linting in new packages (`pnpm exec biome check --write`, `biome format --write`). Existing packages using Prettier/ESLint follow their local choice; flag the divergence if it matters, don't migrate unilaterally. Always run `pnpm run format` / `pnpm run lint` before committing.
- Logging: `tauri-plugin-log` + the `desktop-services` logger on the host side; renderer logs route through it if they need to land on disk.

### Documentation

- Markdown under `docs/src/`.
- Reference concrete file paths and binaries when possible.
- Short, scannable sections with headings and bullets — not walls of text.

## UI design philosophy

Nice UI without stress or pretension. The rail-and-panel shell is where most of the visual work lands; the rules below keep it calm.

- **Take time on layout.** UI work is not a speed contest. Sit with the proportions, spacing, and visual hierarchy. If a rail feels heavy, lighten it; if a panel feels empty, compact it. Iterate.
- **No decoration that doesn't earn its keep.** Restraint reads as quality. Drop gradients, glow, animated backgrounds, ostentatious typography — keep effects for moments where they communicate something (focus, state change, motion of meaningful content).
- **Look at references before designing.** When building or redesigning a screen, pull two or three reference screens from real products (Refero MCP when available — Missive, Hume AI, Copy.ai, OpenAI Playground are good analogs for SOMA's three-column workspace shell). Ground design decisions in something concrete; don't design in a vacuum.
- **Composition over re-implementation.** Reach for `@soma/ui` primitives first (`DesktopShell`, `AppTabs`, `PanelContainer`, `PanelStack`, `PanelChipBar`, `TreePopover`, `DenseRow`, `AiChat`, `BotList`, `SettingsTabs`, `CommandPalette`, `Empty`, `Pill`, `Kbd`). If a primitive doesn't fit, extend it with a small typed prop (e.g. `PanelStackItem.size: "fill" | "content"`) rather than forking it.
- **Respect locked-in design contracts.** When a primitive's docstring states a contract — `Panel`'s floating-card-with-soft-shadow chrome, `PanelChipBar`'s placement in `mainTopLeft` / `mainTopRight`, `PanelStack`'s vertical sizing — don't undo it without explicit instruction. The contract is usually there because a previous attempt without it broke something.
- **Empty states are inline status lines, not centered placards** unless the screen genuinely has nothing else to do. A 0-page Pages panel should read as one muted line, not a giant whitespace void.
- **Section labels are tiny tracking-wider caps** in muted color (`text-base-content/55` or similar), inline with the content. Save heavy card-header chrome for places where the seam between sections actually needs to read at a glance.

## Design patterns in use

- **Facade**: `soma_core::db::DbFactory` for SQLx; `@soma/sdk`'s `Backend` is the renderer's facade over the host commands; `desktop-daemon`'s `DaemonClient` is the host's facade over the embedded runtime.
- **Factory Method / Builder**: `DbFactory::any/sqlite` for SQLx pools; runtime config builders in `desktop-daemon` / `desktop-agent`.
- **Presenter / transport-agnostic handler**: `desktop-api` holds the behaviour; `desktop-commands` (Tauri) and `desktop-bff` (HTTP/SSE) are thin presenters over it. Add a capability once in the handler layer, expose it through each presenter.
- **Delegation / Chain of Responsibility / Composite**: `PeerEventDispatcher` routes events to a chain of handlers. Add behaviors by implementing `PeerEventHandler` and registering.
- **Strategy**: logging vs metrics handlers are interchangeable strategies; `@soma/sdk` transports (Tauri vs HTTP) are interchangeable strategies behind the same `Backend` facade.
- **Repository**: SQLx queries are wrapped per aggregate (memberships, join_decisions, issuer_capabilities, mailbox) in `backend/crates/storage`. Same pattern when the CrateStack schema lands — repositories sit on top of `cratestack-rusqlite` `ModelDelegate`s.
- **MVC**: Axum handlers in server backends are controllers; DB + peer services are model; response serializers are view. Keep controllers thin.

## Telemetry & Logging

Backends initialize tracing via `soma_core::telemetry::init_tracing(...)` (`backend/crates/core/src/telemetry.rs`).

- `RUST_LOG` — log filter (preferred); falls back to binary-provided default (typically `info`).
- `SOMA_LOG_FORMAT` — `json` (also accepts `structured`, `true`, `1`) for JSON logs; otherwise plain text.
- `SOMA_LOGS_DIR` — when set, writes weekly-rotating files under this dir. When unset, logs go to the process's default writer (stdout/stderr).
- `SOMA_FLAME_ENABLED` — opt-in flame capture (folded stack output) via `tracing-flame`; `.folded` file per binary in a sibling `flame/` directory.

In the desktop host, tracing init is gated: the `desktop-services` logger initializes once at startup and routes output to the user's logs dir (`~/Library/Logs/Soma/` on macOS, `~/.local/state/soma/logs/` on Linux). `tauri-plugin-log` forwards relevant events to the renderer.

## Packaging, Signing, Releases

Target — sudoless, signed, single-bundle, produced by the **Tauri bundler** (`tauri build`). The distribution philosophy below is unchanged from the Electron era; only the toolchain changed.

> **Status:** a Tauri desktop *release workflow* is not yet wired. `release-desktop.yml` (the Electron pipeline) was removed with the Electron app; the principles below describe the intended Tauri packaging, and the docs landing-page download links remain pointed at the stale Electron assets until a Tauri release pipeline lands.

### macOS

- One `.app` per install — a Tauri bundle embedding the runtimes in the host binary. No separate `soma-daemon.app` / `soma-agentd.app`.
- Build → **Developer ID Application** code-sign → notarize via `notarytool` → staple (Tauri's bundler drives signing/notarization from env-provided credentials).
- Distribute as a notarized `.dmg` (standard) **and** a notarized `.app`/`.zip` (manual) via the GitHub Release. No `/Library/LaunchAgents`, no `pkgbuild`, no `installer` invocation, no sudo, no `xattr -dr` quarantine stripping, no install/uninstall scripts.
- macOS Login Item / autostart registered so the peer is online from session start (when the user opts in). The peer is alive only while the process is running — closing the window hides to tray.
- arm64 only (5e38e7d set the precedent; the Intel path was retired).

### Linux

- Distribute as a `.deb` (standard) **and** an `.AppImage` (no-install) per arch (amd64 + arm64) via the GitHub Release. The `.deb` installs via `sudo apt install ./soma-...deb` and surfaces in the application menu; the AppImage is `chmod +x`-and-run for users who'd rather not touch a package manager. No tarball, no install script, no systemd unit shipped — autostart is the user's problem (a `.desktop` file under `~/.config/autostart/` is the conventional way).
- No rpm by default. If we ship a Fedora/openSUSE package later, it follows the same dual-track principle (one sudo'd standard install, one portable AppImage).

### CI

- GitHub Actions. `test.yml` runs on push/PR (Rust workspace build+test, `@soma/ui` + `@soma/editor` vitest coverage, Storybook-driven UI E2E). Release workflows are manual-triggered (`workflow_dispatch`).
- `.github/targets.json` is the single source of `(os, arch)` truth. Today only `release-server.yml` consumes it (the `server` slice) via a tiny `targets` job that `jq`s the slice and emits it as a job output, then `build.strategy.matrix.include` consumes it via `fromJSON(needs.targets.outputs.server)`. Adding a server target = one entry in `targets.json`. (The old `desktop` slice was removed with the Electron release pipeline; a future Tauri release workflow can re-add a desktop slice.)
- **Desktop release: not yet wired.** The Electron `release-desktop.yml` was removed with the Electron app. A Tauri equivalent (`tauri build` + sign/notarize + publish) still needs to be authored; the Apple Developer ID + App Store Connect API-key secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY` content, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`) carry over to the Tauri bundler.
- `release-server.yml` builds **one** `somad` Docker image (distroless, non-root) per `(os, arch)` and publishes to GHCR.
- `release-pages.yml` deploys docs (VitePress) + Storybook to GitHub Pages.
- SBOMs via `anchore/sbom-action` (Syft).

### Docker (server)

- One image: `ghcr.io/<owner>/somad`. Built from one `Dockerfile` (no per-service targets).
- Base: `gcr.io/distroless/static-debian12:nonroot`.
- Multi-arch (amd64 + arm64) built from prebuilt MUSL binaries copied from `dist/backend/linux-<arch>/somad`. No Rust compile during `docker build`.
- Mode is selected at runtime via the entrypoint args: `docker run ghcr.io/.../somad bot --http-addr 0.0.0.0:8080 ...`, `... somad relay --http-addr 0.0.0.0:8081 ...`, etc.
- Default ports per mode (forward when testing locally):
  - `somad bot`: `8080` (HTTP) + `14005` tcp / `14105` tcp / `14205` udp (libp2p)
  - `somad relay`: `8081` (HTTP) + `14003` tcp / `14103` tcp / `14203` udp (libp2p)
  - `somad rendezvous`: `8082` (HTTP) + `14004` tcp / `14104` tcp / `4204` udp (libp2p)
  - `somad bff`: `8083` (HTTP)
  - `somad all`: composes multiple; binds the union of the modes declared in `--config`.

## Crash isolation & supervision

- **A command handler must never panic the host.** Return typed errors from `desktop-api` handlers; convert them to `@soma/sdk` `BackendError`s at the Tauri boundary.
- **No `unwrap`/`expect` in async paths inside the host** beyond clearly-infallible setup.
- **Tokio panic = task aborts**, not process death — but cascading failures of critical tasks should be logged and surfaced to the renderer.
- **CPU discipline**: keep command handlers async and non-blocking. Heavy CPU work (embeddings, hashing, OCR, Yjs merges) runs on `spawn_blocking` or dedicated thread pools so the host stays responsive.

## Testing and Validation

### Rust

```bash
cd backend
cargo test
```

Smoke tests that bind local sockets (live in the shared service crates, exercised through `somad <subcommand>`):

```bash
cd backend
cargo test -p soma-relay --test smoke -- --ignored
cargo test -p soma-rendezvous --test smoke -- --ignored
```

Tests live alongside the code they exercise (same crate, nearby module). Keep tests deterministic — avoid network/timing dependencies unless absolutely necessary.

### Desktop host (Rust)

- `cargo build --workspace` / `cargo test --workspace` cover the `desktop-*` crates alongside the backend crates. `desktop-bff` carries integration tests under `desktop/desktop-bff/tests/`.

### Desktop App (TS)

```bash
pnpm install
pnpm --filter @soma/desktop-app run typecheck
pnpm --filter @soma/desktop-app run lint
pnpm --filter @soma/desktop-app run build      # tsc + vite build (renderer)
pnpm --filter @soma/desktop-app run tauri:dev   # full app (host + renderer)
```

Shared packages:

```bash
pnpm --filter @soma/ui exec vitest run
pnpm --filter @soma/editor exec vitest run
pnpm --filter @soma/sdk exec vitest run
pnpm --filter @soma/e2e run test                # Cucumber × Playwright over Storybook
```

### Manual flows

- Launch the desktop app (`pnpm --filter @soma/desktop-app run tauri:dev`); verify the host initializes the runtimes and the main window reveals after the native splash.
- Exercise join flows, page navigation, the practice route, basic messaging, blob upload + read.

## Networking Services (Relay + Rendezvous)

Soma uses two lightweight libp2p infrastructure services to improve discovery and connectivity:

- **Relay** (`somad relay` / `backend/crates/relay`): Circuit Relay v2 for NAT traversal and relayed connectivity.
- **Rendezvous** (`somad rendezvous` / `backend/crates/rendezvous`): peer registration and discovery.

Identity persistence: both services persist a libp2p ECDSA keypair so Peer IDs stay stable across restarts. Env var `SOMA_DATA_DIR`; default paths `./data/relay/identity.key` and `./data/rendezvous/identity.key`. Deleting these files yields a new Peer ID on next start.

Transports (TCP + QUIC + WebSocket) listed above under each service.

Running locally:

```bash
cd backend
cargo run --bin somad -- relay --http-addr 0.0.0.0:8081
cargo run --bin somad -- rendezvous --http-addr 0.0.0.0:8082
```

Both expose `GET /healthz` → `"ok"` and `GET /metrics` → Prometheus text format.

For peer connectivity details (mDNS, rendezvous client, relay client behavior, CLI flags), see `docs/src/architecture/peer-connectivity.md`.

## General Practices

- Favor small, focused pull requests.
- Maintain existing patterns where reasonable; introduce new patterns deliberately and document them in this file.
- Update docs (`docs/src/`) when you add or significantly change a feature — especially when it affects onboarding or architecture.
- When unsure where to place new code, bias toward the smallest scope (module or crate) that can own the responsibility; update this document if you establish a new pattern.
- Pre-prod: it's fine to break things. Backwards-compatibility shims are usually waste.
