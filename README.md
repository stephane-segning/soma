# Soma

[![Release Docs and Desktop Packages](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml)
[![Release desktop (Electron)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml)
[![Release daemons (soma-daemon + soma-agentd)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml)
[![Release bundle](https://github.com/stephane-segning/soma/actions/workflows/release.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release.yml)
[![Build backend Docker images](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml)

Soma is a local-first workspace platform built around a structured note-taking app, a focused training companion app, and optional peer/network infrastructure.

At the product level:

- `Soma` is the main Notion-like note-taking and workspace application
- `Tapia` is the companion app for small IT-training jobs such as typing drills, tap-touch practice, and exams
- the p2p layer exists so workspaces can keep working even where normal internet access is weak or unavailable
- spaces/workspaces are private collaboration groups with memberships, approvals, and capability-based permissions for both humans and bots

The repo is still a monorepo, but the day-to-day tooling is being separated more clearly:

- `backend/` owns Rust builds, tests, and `cargo xtask`
- `desktop/` owns pnpm workspaces, Electron apps, docs package builds, and packaging
- the root `justfile` is a convenience delegator, not the source of truth for every workflow

## What Is Here

- `backend/`: Rust workspace for `soma-daemon`, `soma-botd`, `soma-agentd`, relay/rendezvous services, shared peer/storage crates, and server utilities
- `desktop/soma`: the main Electron desktop app
- `desktop/tapia`: a lighter Electron app with a smaller current feature surface
- `desktop/desktop-*`: shared desktop packages for proto bindings, config, editor, data, UI, and packaging
- `proto/`: shared daemon/agent/membership contracts
- `docs/`: current documentation
- `planning/`: active plans and migration notes

## Shared Contract Boundary

- `proto/` is the current source-of-truth for cross-runtime contracts
- Rust consumes those contracts through `backend/crates/proto-build`
- TypeScript/Electron consumes them through `desktop/desktop-proto` (`@soma/proto`)
- both generators now support `SOMA_PROTO_ROOT=/absolute/path/to/proto` as split-readiness groundwork

Contract details live in `docs/src/architecture/shared-contracts.md`.

## Current Runtime Shape

- `soma-daemon` is the main local backend for the desktop app: spaces, memberships, pages, documents, blobs, and peer networking
- `soma-agentd` is a local helper for chat, embeddings, rerank, and Yjs merge/drift work
- `desktop/soma` talks to both over local IPC from the Electron main process
- `soma-botd`, `soma-relayd`, and `soma-rendezvousd` are optional network/infrastructure pieces for more realistic peer flows

## Fast Start

Install desktop workspace dependencies from the repo root:

```bash
just desktop-install
```

Then use the root `justfile` delegators:

```bash
just backend-run-daemon
just backend-run-agentd
just desktop-run-soma
```

Useful additional commands:

- `just backend-run-botd`
- `just backend-run-relayd`
- `just backend-run-rendezvousd`
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
- the shared desktop config package normalizes stage-specific socket paths such as `/tmp/soma-daemon-dev.sock` and `/tmp/soma-agentd-dev.sock`
- root task names without the `backend-` or `desktop-` prefix are transitional aliases kept for compatibility while tooling boundaries are clarified

## Docker Compose

- Default stack: `docker compose up -d`
- If your Compose version does not support `include`, use:

```bash
docker compose -f compose/backend.infra.yml -f compose/backend.botd.yml -f compose/backend.bffd.yml up -d
```

## License

This project is available under the terms of the MIT License. See `LICENSE`.
