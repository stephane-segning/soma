# Soma

[![Release Docs and Desktop Packages](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml)
[![Release desktop (Electron)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml)
[![Release server (somad)](https://github.com/stephane-segning/soma/actions/workflows/release-server.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-server.yml)

Soma is a local-first workspace platform built around a structured note-taking app, a focused training companion app, and optional peer/network infrastructure.

At the product level:

- `Soma` is the main Notion-like note-taking and workspace application; it also ships a `/practice` route for short typing drills (formerly the separate `Tapia` companion app)
- the p2p layer exists so workspaces can keep working even where normal internet access is weak or unavailable
- spaces/workspaces are private collaboration groups with memberships, approvals, and capability-based permissions for both humans and bots

The repo is still a monorepo, but the day-to-day tooling is being separated more clearly:

- `backend/` owns Rust builds, tests, and `cargo xtask`
- `desktop/` owns pnpm workspaces, Electron apps, docs package builds, and packaging
- the root `justfile` is a convenience delegator, not the source of truth for every workflow

## What Is Here

- `backend/`: Rust workspace. Library crates `soma-daemon` and `soma-agentd` are linked into the `@soma/node` napi addon (`backend/crates/soma-node`) and run in-process inside Electron main. The only standalone backend binary is `somad`, which dispatches to `bot` / `relay` / `rendezvous` / `bff` / `all` subcommands.
- `desktop/soma`: the only Electron desktop app — Soma workspace UI plus the merged-in typing practice surface under `/practice` (formerly Tapia)
- `desktop/desktop-*`: shared desktop packages for config, editor, data, UI, and (legacy) proto bindings
- `proto/`: record-shape definitions reused as type sources (no live gRPC server on the desktop side)
- `docs/`: current documentation
- `planning/`: active plans and migration notes

## Shared Contract Boundary

- `proto/` defines shared record types; the desktop side no longer uses these as live gRPC services — Electron main calls the napi addon directly
- Rust consumes the proto definitions through `backend/crates/proto-build`
- The TS proto package (`desktop/desktop-proto`, `@soma/proto`) is legacy; the napi addon ships its own `napi build --dts` types

Contract details live in `docs/src/architecture/shared-contracts.md`.

## Current Runtime Shape

- The desktop app loads the `@soma/node` napi addon at startup. The addon embeds the `soma-daemon` library (spaces, memberships, pages, documents, blobs, peer networking) and the `soma-agentd` library (Yjs drift resolution + agent helpers) inside the Electron main process. There is no separate daemon binary and no Unix-socket IPC; Electron main calls the addon directly via `SomaHandle` / `DaemonHandle` / `AgentHandle`.
- Chat, embeddings, and rerank go directly from Electron main to an OpenAI-compatible HTTP endpoint (Ollama or remote provider) — the agent library no longer proxies model RPCs.
- The optional server peers (`somad bot`, `somad relay`, `somad rendezvous`, `somad bff`, `somad all`) are subcommands of the single `somad` binary.

## Fast Start

Install desktop workspace dependencies from the repo root:

```bash
just desktop-install
```

Then use the root `justfile` delegators:

```bash
just desktop-run-soma
```

The desktop app starts the embedded daemon + agent runtimes in-process; there is nothing else to launch for a single-machine setup.

Useful additional commands:

- `just backend-run-bot`
- `just backend-run-relay`
- `just backend-run-rendezvous`
- `just backend-test`
- `just desktop-test-all`
- `just docs-build`

If you prefer to work directly in the owning workspace instead of using root shortcuts:

- backend: `cd backend && cargo test`
- backend CI helpers: `cd backend && cargo xtask --help`
- desktop: `cd desktop && pnpm --filter soma dev`
- docs build: `cd desktop && pnpm --filter @soma/docs run build`

For a fuller walkthrough, see `docs/src/getting-started/index.md`.

## Repository Notes

- `planning/` contains active plans and cutover notes; it is not the canonical documentation surface
- `docs/` is being narrowed to current, implemented, or finished behavior only
- the shared desktop config package (`@soma/desktop-config`) does stage detection + path normalization for the Tauri data dirs (e.g. `Soma-dev` vs `Soma`) — no `electron` dependency and no socket paths; the daemon runs in-process inside the Tauri `src-tauri` host
- root task names without the `backend-` or `desktop-` prefix are transitional aliases kept for compatibility while tooling boundaries are clarified

## Docker Compose

- Default stack: `docker compose up -d`
- If your Compose version does not support `include`, use:

```bash
docker compose -f compose/backend.infra.yml -f compose/backend.botd.yml -f compose/backend.bffd.yml up -d
```

## License

This project is available under the terms of the MIT License. See `LICENSE`.
