# SOMA

Local-first workspace platform that ships as **two artifacts**: one Electron desktop app and one server binary. Both are thin shells around the same shared Rust crates — the desktop loads them as a napi-rs `.node` addon, the server runs them as subcommands of a unified binary. Long-running availability is provided by the server binary running in bot mode.

## Architecture (target)

Two build artifacts. One source tree.

**Desktop** — `desktop/soma/`: the only Electron app. Includes a `/practice` route (formerly Tapia). Main process loads `soma-node.<os>-<arch>.node` at startup. No separate daemon binaries, no Unix-socket IPC, no spawning of child processes.

**`soma-node` addon** — `backend/crates/soma-node/`: napi-rs cdylib. Embeds the peer + agent runtimes in **one** Tokio runtime, owns **one** SQLite database (managed via CrateStack), exposes async `#[napi]` methods to Electron main. Same shared crates the server binary uses.

**Server** — `somad`: the only server binary. Subcommands select behavior; subcommand options pass mode-specific configuration. Same shared crates the addon uses; mode is purely a runtime concern.

```
somad bot         [--http-addr ...] [--db-path ...] [--mode bot|admin] [--listen-addr ...]
somad relay       [--http-addr ...] [--data-dir ...]
somad rendezvous  [--http-addr ...] [--data-dir ...]
somad bff         [--http-addr ...] [--provider ...]
somad all         --config server.toml      # composes multiple modes in one process
```

Subcommands map to the existing service crates: `bot` uses `crates/peer` + `crates/membership` + `crates/storage`; `relay` uses `crates/relay`; `rendezvous` uses `crates/rendezvous`; `bff` uses `crates/bff`; `all` is the orchestrator (replaces the former `serverd`).

What's gone in the fully-collapsed target:

- `backend/bins/daemon/`, `backend/bins/agentd/` — desktop runtimes move to `crates/desktop-peer/` and `crates/desktop-agent/` (lib-only). The addon consumes them; no binaries.
- `backend/bins/botd/`, `backend/bins/relayd/`, `backend/bins/rendezvousd/`, `backend/bins/bffd/`, `backend/bins/serverd/` — replaced by `backend/bins/somad/` with subcommands.
- `desktop/tapia/` — merged into Soma's `/practice` route.
- `desktop/desktop-proto/` (`@soma/proto`) — gRPC TS codegen unnecessary because Electron main calls the addon directly; libp2p protobuf stays Rust-only.
- `daemon-process-manager`, splash-blocks-on-daemon-Status gate, socket-path config plumbing in `@soma/desktop-config`.
- All LaunchAgent / systemd-user-unit infrastructure for the desktop side; the embedded peer lives in-process.
- All install/uninstall `sudo` (sudoless user-domain install at `~/Applications/Soma`).
- The macOS `.pkg` path (replaced by a notarized zip).
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
- [x] P6a — Packaging cleanup: sudoless user-domain install at `~/Applications`, SHA256SUMS published with `desktop-v*` releases, install/uninstall bootstrap dedup, obsolete `desktop/packaging/` + `release.yml` (bundle workflow) deleted
- [x] P6b — Developer ID code signing + notarization: `electron-builder.yml` has `notarize: true`; `release-desktop.yml` reads `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (content, materialized to `$RUNNER_TEMP/AuthKey.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID` from repo secrets; ad-hoc `codesign --sign -` + `ditto` rezip step removed
- [x] P7 — CI matrix dedup: `.github/targets.json` is the single `(os, arch)` source, consumed via a `targets` job + `fromJSON` in both `release-desktop.yml` and `release-server.yml`. Dead `release-daemons.yml` + its sole-consumer `cargo-cross-build` composite action removed. `docker-backend.yml` renamed to `release-server.yml` to match the doc.

When this document says "today" or describes current behavior in present tense, treat it as the *intended* behavior in the target architecture — verify against the code if you need to make a load-bearing decision.

## Repository Layout

- `backend/` — Rust workspace.
  - `crates/soma-node/` — napi-rs addon (cdylib) embedding the desktop peer + agent runtimes; loaded by Electron main.
  - `crates/desktop-peer/` — desktop peer runtime (former `bins/daemon`'s library). Consumed by `soma-node` and by `somad desktop-peer` (transitional; removed once Soma main no longer spawns a peer process).
  - `crates/desktop-agent/` — desktop agent runtime (former `bins/agentd`'s library). Consumed by `soma-node` and by `somad desktop-agent` (transitional).
  - `crates/peer/` — libp2p peer behaviour, event types, request/response protocols.
  - `crates/agent/` — local LLM/embed/Yjs reconciliation runtime.
  - `crates/storage/` — repositories + schema; consumes the `.cstack` schema via `cratestack-rusqlite`.
  - `crates/core/` — domain types, `DbFactory`, telemetry, shared utilities.
  - `crates/net/` — libp2p swarm builder (typestate transport order: TCP → QUIC → DNS → WS → Behaviour).
  - `crates/membership/`, `crates/api/`, `crates/cache/`, `crates/common/`, `crates/metrics/`, `crates/vdfs/`, `crates/socket/`, `crates/relay/`, `crates/rendezvous/`, `crates/bff/`, `crates/proto-build/` — unchanged in role.
  - `bins/somad/` — the **only** server binary. Subcommand-dispatch entry point (`bot`, `relay`, `rendezvous`, `bff`, `all`). Mode-specific argument parsing lives per-subcommand under `bins/somad/src/commands/`.
- `desktop/` — single Electron app + shared TS packages.
  - `desktop/soma/` — Soma app. Renderer under `src/renderer`, main under `src/main`. Loads `@soma/node` (the napi addon).
  - `desktop/soma/src/renderer/src/routes/practice/` — merged-in Tapia.
  - `desktop/desktop-ui/` — shared React components (`@soma/ui`), subpath-imports only (`@soma/ui/components/*`, `@soma/ui/hooks/*`, etc.; no root export).
  - `desktop/desktop-config/` — stage detection + path normalization (`@soma/desktop-config`). Socket-path logic deleted in P4.
  - `desktop/desktop-editor/`, `desktop/desktop-data/`, `desktop/desktop-icons/` — supporting packages.
- `proto/` — libp2p wire formats (rust-only after P4 when `desktop-proto` is removed).
- `docs/` — VitePress docs (`@soma/docs`). Hosts the `install.sh` / `uninstall.sh` bootstrap.
- `deploy/` — Helm charts and infrastructure manifests for server backends.
- `prd/` — product requirements.
- `.github/workflows/` — release pipelines (single desktop matrix, single addon matrix, server-binary matrix).

Where to put new code:

- Domain logic → `backend/crates/core` or a focused new crate.
- Storage queries → `backend/crates/storage` (repository modules per aggregate).
- Peer wire/event behaviour → `backend/crates/peer`.
- Things exposed to Electron → `backend/crates/soma-node` (napi surface only; delegate to other crates).
- Renderer UI → `desktop/soma/src/renderer`.
- Reusable UI → `desktop/desktop-ui` (and update its subpath exports).

## Terminology: VDF

**VDF** is a **cache-only peer role** that improves availability/latency by fetching and caching content-addressed data.

- VDFs **never accept user uploads** and are **not a source of truth** for user-created blobs.
- VDFs may cache in-memory (LRU/TTL), on disk, or via an external cache (Redis); writes are allowed only as a side-effect of *fetching/verifying* content.
- VDFs must **verify bytes match the claimed CID** before serving/persisting.
- The crate is `soma-vdfs` for historical reasons; "VDF" is the canonical term in docs and conversations.

## Tech Stack

- **Rust** — embedded runtime (`soma-node` addon) and all server backends. New crates default to **edition 2024**; existing crates migrate opportunistically.
- **napi-rs** — Rust↔Node-API binding. Produces a `.node` per `(os, arch)` loaded by Electron main via `require()`.
- **CrateStack (`cratestack-rusqlite`)** — schema-first SQLite layer. One `.cstack` schema is the source of truth for the addon's database; generated via `include_embedded_schema!`. Sync API, bundled SQLite, no tokio on the data path → friendly for FFI/napi bridging. Repo at `~/dev/cratestack`.
- **Electron + React + TypeScript** — desktop UI. `strict` TS. pnpm workspace.
- **Cargo workspace**, `resolver = "3"`, all third-party versions under `[workspace.dependencies]` in root `Cargo.toml`.
- **Tokio** — single runtime per process. The addon owns the runtime; server binaries each own theirs.
- **libp2p** — peer transport (TCP + QUIC + WebSocket), circuit-relay v2 for NAT traversal, rendezvous for discovery.
- **Tonic / Prost** — gRPC + protobuf for libp2p wire formats; **no** gRPC over Unix sockets between Electron and the addon (direct napi calls instead).
- **Server storage** — SQLx AnyPool (Postgres or SQLite via `SOMA_DATABASE_URL`) for `somad bot` until CrateStack migration lands as a separate phase.
- **`tracing`** for logs; `mimalloc` as the global allocator in all backends.

## The soma-node Addon

`backend/crates/soma-node/` is the only thing Electron loads. It is the boundary between Rust and Node.

Crate shape:

- `[lib] crate-type = ["cdylib"]`, edition 2024.
- Depends on the library forms of the peer and agent runtimes (post-P1). Builds them in a single Tokio runtime owned by the addon.
- One SQLite database shared by both runtimes (no more split `daemon.db` / `agentd.db`). Schema declared in a single `.cstack` file consumed via `include_embedded_schema!`.

API conventions:

- **Async-only** at the napi boundary. Every `#[napi]` method returns a `Promise`; no sync work that could stall the Electron event loop.
- **`catch_unwind` at every boundary**. A Rust panic must never crash Electron main; convert to a typed error and surface it to JS.
- **Supervisor pattern**. The addon exposes `start({ config }) -> Handle` and `Handle.shutdown()`. On unrecoverable runtime failure the supervisor logs, signals the JS layer, and exits cleanly so Electron's main process can restart the addon.
- **TypeScript types are generated** via `napi build --dts` and re-exported from `desktop/soma`'s main process.
- **Streaming** uses napi's `ThreadsafeFunction` / async iterators. Used for chat-stream, peer events, document subscriptions, blob reads.
- **No global mutable state** in the addon itself (beyond the supervisor singleton); state lives inside the handle returned to JS.

What lives in the addon vs the runtime crates:

- The addon is glue. Business logic stays in `soma-peer`, `soma-agent`, `soma-storage`, etc.
- The addon translates between napi types and the Rust API; it does not own domain logic.

## Storage (CrateStack)

One `.cstack` schema describes the embedded database. Lives at `backend/crates/storage/schema.cstack` (or `backend/crates/soma-schema/schema.cstack` — finalized in P3).

- The **addon** consumes the schema via `cratestack::include_embedded_schema!("schema.cstack")`.
- **`somad bot` stays on SQLx for now.** Migrating botd's Postgres + SQLite paths to CrateStack is its own phase; the one-macro-per-crate constraint (`include_server_schema!` vs `include_embedded_schema!`) needs a deliberate design choice for that.
- Single database file per install at `~/Library/Application Support/Soma/soma.db` on macOS, `~/.local/share/soma/soma.db` on Linux. Stage-specific (`-dev`, `-staging`) suffixes via `@soma/desktop-config`.
- Tables (target schema — verify against the `.cstack` file): `spaces`, `space_memberships`, `join_decisions`, `join_requests`, `issuer_capabilities`, `mailbox`, `documents`, `pages`, `blobs`, `blob_refs`, `peer_public_keys`, plus agent-runtime tables (chat sessions, embeddings, etc.) that previously lived in `agentd.db`.
- `cratestack-rusqlite` provides the sync data API; the addon wraps reads/writes in `spawn_blocking` only where contention is real (it usually isn't — rusqlite is fast).
- No SQLx migrations directory on the desktop side; CrateStack generates schema from the `.cstack` source. Migration is a separate concern handled at addon start (DDL + version table).

## Desktop App (Soma)

Single Electron app at `desktop/soma/`. Tapia merged in as a `/practice` route in P2.

Process model:

- Main process: loads the addon, owns the supervisor, exposes high-level IPC to the renderer via the preload bridge (`window.api.invoke`).
- Renderer: React + Redux Toolkit + RTK Query for IPC/data. XState for the typing-practice state machine. No Zustand; do not reintroduce TanStack Query.
- No daemon spawn, no socket discovery, no splash gate. Cold-start = process start + addon init + first paint.

Conventions:

- Renderer imports use `@app/*` (configured in `desktop/soma/tsconfig.web.json` + `electron.vite.config.ts`).
- Filenames are **kebab-case** for `.ts`/`.tsx` in both renderer and main.
- IDs are **CUIDs**, not UUIDs.
- `@soma/ui` has **no root export** — import via subpaths (`@soma/ui/components/*`, `@soma/ui/hooks/*`, `@soma/ui/utils/*`, `@soma/ui/yoopta`, `@soma/ui/types`).
- Routing: `react-router` core, memory or hash router (not `react-router-dom`).
- Frameless window: `frame: false`; macOS hides native buttons via `setWindowButtonVisibility(false)`. Drag with `data-drag-region`, opt out with `data-no-drag`.
- Deep links: `soma://...` registered by Electron; secondary launches routed through single-instance lock in `startup-service.ts`.
- Window state persists via `electron-store` in `app-data-store.ts`.
- Logging: Winston in main, writes to `app.getPath("userData")/logs/main.log`.
- Tray-when-window-closed on macOS so the peer stays online for the session.

State and IPC:

- Redux Toolkit slices in `desktop/soma/src/renderer/src/store/`.
- RTK Query (`store/api.ts`) for all IPC/data; use `api.injectEndpoints`, tag for cache invalidation, wrap in `src/queries/*` for ergonomic hooks.
- Side effects (I/O, addon calls) live in dedicated hooks or services, not in components.

Renderer resilience:

- Suspense-wrapped router + route-level `RouteErrorBoundary` (`routes/router.tsx`, `routes/route-fallbacks.tsx`).
- Editor crashes contained at the page area via `PageEditorFallback` around `DocumentEditor`; global `AppErrorBoundary` is the outer net.
- TipTap: `immediatelyRender: false`, gate `ReactRenderer`/event listeners on `editor.options.element`, dispatch only when still mounted.

Blob protocol:

- `soma-blob://daemon/{space_id}/{cid}` handler still registered (the URL scheme is kept for renderer compatibility) but now calls `addon.readBlob(spaceId, cid)` directly — no gRPC roundtrip.

Agent runtime configuration:

- Source of truth: `electron-store` (`settings["agent.config"]`) via main-process settings IPC.
- Default provider: OpenAI-compatible at `http://127.0.0.1:11434/v1` (Ollama-style).
- Supported provider kinds: `agentd` (now: the embedded runtime in the addon), `openai-compatible`.
- Model capabilities (chat/embed/tool/image) are local UI metadata; optional per-workspace overrides under `agent.config.workspaces[space_id]`.
- Provider/model docs: `docs/src/development/agentd-models.md`.

Practice route (merged Tapia):

- Pure renderer surface; no addon dependency required (typing practice is local-only).
- Uses XState for the typing state machine, Motion for cursor/feedback animations, a stable grapheme + diff library (`graphemer` / `grapheme-splitter` and `diff-match-patch` / `diff`), `simple-keyboard` for the on-screen keyboard.

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

### `somad desktop-peer` / `somad desktop-agent` (transitional)

Temporary back-compat subcommands that run the desktop runtimes as standalone processes. Exist only while `desktop/soma/`'s main process still spawns child processes for the peer/agent (pre-P4). Once Soma main loads the `.node` addon directly (P4), these subcommands are removed.

These subcommands wrap `crates/desktop-peer::run(config)` and `crates/desktop-agent::run(config)` directly — they exist so the existing daemon-spawn pathway keeps working through P5 without an extra binary in the tree.

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

## Blobs (content-addressed, addon-owned)

Binary assets (files, images, attachments, Yoopta-related assets) are **content-addressed objects** stored outside Yjs/Yoopta. Collaborative documents store **references** to blobs, never bytes.

Roles and rules:

- The **embedded peer in the addon** is the source of truth for user-created blobs.
- `somad bot` is **cache-only** for blobs in both `bot` and `admin` modes (writes allowed only as a side-effect of fetching from the network; never accepts user upload).
- Blob identity is a CID computed from bytes (e.g. `sha256`); storage is keyed by CID (content-addressed).

Upload (addon-internal):

- Entrypoint: Electron main calls `addon.uploadBlob({ spaceId, bytes, contentType, name, yooptaContext? })`.
- The addon persists bytes into the configured blob pool (space-scoped layout) and records minimal metadata (size, content type, original name) in SQLite.
- A peer event is emitted **only** when the blob is associated with Yoopta content (i.e. upload includes Yoopta context like `document_id` / `node_id`). Non-Yoopta blobs are stored but generate no Yoopta-related events.

Read and serve (renderer → main → addon):

- Renderers load bytes via `soma-blob://daemon/{space_id}/{cid}` (kept for URL stability).
- The Electron protocol handler (`desktop/soma/src/main/services/blob-protocol.ts`) calls `addon.readBlob(spaceId, cid)` — direct, no IPC.

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

- Validate declared sizes/content types and enforce max blob sizes at ingress (addon API) and egress (network transfer).
- **Always verify bytes match the CID before persisting/serving.**
- Treat all remote blobs as untrusted; no automatic execution/rendering without UI sandboxing.

## Joins, Memberships, Capabilities

Join MVP has two planes:

- **Transport**: `soma-peer` (libp2p request/response). Protocols `/soma/join/1` and `/soma/join-decision/1`.
- **Policy + persistence**: `soma-membership` + SQLx (or CrateStack on the addon side) repositories — `join_requests`, `join_decisions`, `space_memberships`, `mailbox`.

Flows:

1. **Single-target join (decider online)**: requester sends `JoinRequest` over `/soma/join/1`; decider records `join_requests` (pending), returns immediate `JoinDecision` (pending or approved). On approval, decider records `join_decisions` + upserts `space_memberships` and sends signed `JoinDecision` over `/soma/join-decision/1`. Requester persists the membership.
2. **Multi-target retry (owner offline, delegated bot online)** *(not yet implemented)*: requester tries candidate deciders in order (owner first, then delegated bots) until one responds; retry queue in `join_requests` with `is_outgoing=1`.
3. **Mailbox fallback (requester offline)**: decider's outbound `SendJoinDecision` fails → enqueue in `mailbox` (kind=`join_decision`, status=`queued`) → periodic sweep + on-connect drain retries delivery; ack on receipt; `mailbox.mark_done`.

Open security work (currently provisional):

- [ ] **Verify `MembershipCapability.signed`** on receipt at the daemon using the issuer public key from libp2p Identify. If `issuer != owner`, verify the issuer delegation chain (owner → issuer capability → membership).
- [ ] **Verify `IssuerCapability.signed`** (owner signature) and enforce expiry/allowed roles consistently before auto-approving.
- [ ] **Canonical signing format**. Current signing uses CBOR via `ciborium`, but canonical CBOR is not guaranteed. Move to a canonical scheme before relying on cross-version/cross-implementation signatures.
- [ ] **Space genesis artifact**. Today `spaces.owner_peer_id` is DB-local metadata only; add an owner-signed record other peers can verify.
- [ ] **Issuer delegation lifecycle** with auditable issuance/rotation from both addon (gRPC/IPC) and admin HTTP.
- [ ] **Space membership revocation/leave** end-to-end.
- [ ] **Space roster / discovery** helpers exposed from addon (`listSpaceMembers`, `discoverSpaces`).

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
- Embedded addon: same allocator/tracing conventions, no clap; config comes from the napi caller.

### TypeScript / pnpm

- pnpm workspace at `pnpm-workspace.yaml`; pnpm 9.
- Strict TypeScript everywhere.
- Built-only dependencies (electron, esbuild, protobufjs, the addon native build) pinned in `pnpm.onlyBuiltDependencies`.

## Code Style

### Rust

- Stable Rust; `rustfmt`-formatted. New crates default to edition 2024.
- Self-describing names; avoid single-letter identifiers except for well-understood indices.
- Small, cohesive modules.
- `tracing` for logs; no `println!` in production code.
- Rich error types (thiserror / anyhow). Reserve `panic!` for truly unrecoverable cases — and remember any panic in the addon would propagate to Electron main if not caught.
- Explicit async boundaries; never block inside async tasks.
- Traits-first abstraction: define behavior behind traits, prefer trait impls on small structs/newtypes, default methods on traits over separate helper modules. Free functions only for pure, stateless utilities.

### TypeScript / React (Soma)

- Function components with hooks; keep side effects in services/hooks, not components.
- Use existing hooks/state containers before adding new global state mechanisms.
- Redux Toolkit + RTK Query for data; XState for finite state (practice typing); do not introduce Zustand or TanStack Query.
- `pnpm run format` / `pnpm run lint` before committing.
- Logging: Winston in main; renderer logs through main IPC if you need them on disk.

### Documentation

- Markdown under `docs/src/`.
- Reference concrete file paths and binaries when possible.
- Short, scannable sections with headings and bullets — not walls of text.

## Design patterns in use

- **Facade**: `soma_core::db::DbFactory` for SQLx; the napi `start({...})` returning a `Handle` is the addon's facade.
- **Factory Method / Builder**: `DbFactory::any/sqlite` for SQLx pools; runtime config builders in soma-node.
- **Delegation / Chain of Responsibility / Composite**: `PeerEventDispatcher` routes events to a chain of handlers. Add behaviors by implementing `PeerEventHandler` and registering.
- **Strategy**: logging vs metrics handlers are interchangeable strategies. Follow the pattern when adding persistence/instrumentation behaviors.
- **Repository**: SQLx queries are wrapped per aggregate (memberships, join_decisions, issuer_capabilities, mailbox) in `backend/crates/storage`. Same pattern when the CrateStack schema lands — repositories sit on top of `cratestack-rusqlite` `ModelDelegate`s.
- **MVC**: Axum handlers in server backends are controllers; DB + peer services are model; response serializers are view. Keep controllers thin.
- **Supervisor (new)**: the addon wraps the runtime in a supervisor that catches panics and exposes lifecycle to Electron main.

## Telemetry & Logging

Backends initialize tracing via `soma_core::telemetry::init_tracing(...)` (`backend/crates/core/src/telemetry.rs`).

- `RUST_LOG` — log filter (preferred); falls back to binary-provided default (typically `info`).
- `SOMA_LOG_FORMAT` — `json` (also accepts `structured`, `true`, `1`) for JSON logs; otherwise plain text.
- `SOMA_LOGS_DIR` — when set, writes weekly-rotating files under this dir. When unset, logs go to the process's default writer (stdout/stderr).
- `SOMA_FLAME_ENABLED` — opt-in flame capture (folded stack output) via `tracing-flame`; `.folded` file per binary in a sibling `flame/` directory.

In the addon, tracing init is gated: the supervisor calls `init_tracing` once at first `start()` and routes output to the user's logs dir (`~/Library/Logs/Soma/` on macOS, `~/.local/state/soma/logs/` on Linux). Electron main forwards relevant tracing events to the renderer via its existing logging IPC.

## Packaging, Signing, Releases

Target (post-P5) — sudoless, signed, single-bundle.

### macOS

- One `.app` per install, containing the addon (`.node`) shipped inside the Electron bundle. No separate `soma-daemon.app` / `soma-agentd.app`.
- Build → **Developer ID Application** code-sign (`codesign --deep --options runtime --timestamp --sign ...`) → notarize via `notarytool` → `xcrun stapler staple`.
- Distribute as a notarized zip. The installer script (or the user) drags the `.app` into `~/Applications/Soma/`. No `/Applications`, no `/Library/LaunchAgents`, no `pkgbuild`, no `installer` invocation, no sudo, no `xattr -dr` quarantine stripping.
- macOS Login Item registered via `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })` so the peer is online from session start (when the user opts in). The peer is alive only while the process is running — closing the window hides to tray.
- arm64 only (5e38e7d set the precedent; the Intel path was retired).

### Linux

- Tarball unpacked into `~/.local/share/soma/`; binary symlinked into `~/.local/bin/soma` if it's on PATH (otherwise just the launcher in the tarball). AppImage is an acceptable alternative artifact.
- Optional autostart via a user-domain `~/.config/systemd/user/soma.service` (opt-in) or `~/.config/autostart/soma.desktop`. No system-wide units.
- No dpkg/rpm by default. If we ship distro packages later, they remain optional and sudo'd; the default install path is sudoless.

### Installer bootstrap

- `docs/src/public/install.sh` and `docs/src/public/uninstall.sh` are thin wrappers around a shared `bootstrap.sh` (script name as `$1`). Both served from `https://soma.vaam.store/` (gh-pages).
- Bootstrap fetches the bundle's `SHA256SUMS` (signed manifest if/when we sign manifests), verifies the install/uninstall script and the bundle archive before exec.
- macOS Apple Silicon check at the top of the bootstrap; reject Intel cleanly.

### CI

- GitHub Actions, all manual-triggered (`workflow_dispatch`).
- `.github/targets.json` is the single source of `(os, arch)` truth; both `release-desktop.yml` and `release-server.yml` open with a tiny `targets` job that `jq`s the relevant slice and emits it as a job output, then `build.strategy.matrix.include` consumes it via `fromJSON(needs.targets.outputs.<slice>)`. Adding a target = one entry in `targets.json`. `publish-manifest` in `release-desktop.yml` also reads the same slice so the release manifest can never drift from the build matrix.
- `release-desktop.yml` builds the Electron app (incl. `@soma/node` addon native build per `(os, arch)`) + signs + notarizes + publishes to a `desktop-v*` Release.
- `release-server.yml` builds **one** `somad` Docker image (distroless, non-root) per `(os, arch)` and publishes to GHCR.
- `release-pages.yml` deploys docs (VitePress) + Storybook to GitHub Pages.
- SBOMs via `anchore/sbom-action` (Syft).
- Required Apple secrets for notarization (already wired in `release-desktop.yml`):
  - `CSC_LINK` — base64-encoded **Developer ID Application** `.p12`
  - `CSC_KEY_PASSWORD` — `.p12` export password
  - `APPLE_API_KEY` — raw `.p8` contents of the App Store Connect API key (the workflow writes it to `$RUNNER_TEMP/AuthKey.p8` and re-exports `APPLE_API_KEY` as the path)
  - `APPLE_API_KEY_ID` — 10-char key ID
  - `APPLE_API_ISSUER` — issuer UUID
  - `APPLE_TEAM_ID` — 10-char team ID (electron-builder needs it explicit when using API-key notarization)

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

- **Addon panics must never crash Electron main.** `catch_unwind` at every `#[napi]` boundary; convert to typed JS errors.
- **Supervisor pattern**: the addon's top-level runtime is wrapped in a supervisor that monitors task health. On unrecoverable failure it logs, signals the supervisor consumer in JS, and the JS layer decides whether to restart the runtime or surface a fatal error.
- **No `unwrap`/`expect` in async paths inside the addon** beyond the supervisor itself.
- **Tokio panic = task aborts**, not process death — but if multiple critical tasks crash in sequence the supervisor escalates.
- **CPU discipline**: every `#[napi]` fn returns a Promise; no sync work that could starve the Electron event loop. Heavy CPU work (embeddings, hashing, OCR, Yjs merges) runs on `spawn_blocking` or dedicated thread pools.

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

### Addon (after P3)

- Integration tests live in `backend/crates/soma-node/tests/` and exercise the napi surface from Rust via `napi`'s test harness.
- An end-to-end pnpm test in `desktop/soma/tests/` loads the built `.node` and exercises basic IPC.

### Desktop App

```bash
cd desktop
pnpm install
pnpm --filter soma run typecheck
pnpm --filter soma run lint
pnpm --filter soma run build
```

### Manual flows

- Launch Soma; verify the addon initializes and the splash-less startup is fast.
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
