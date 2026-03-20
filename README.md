# Soma

[![Release Docs and Desktop Packages](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml)
[![Release desktop (Electron)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml)
[![Release daemons (soma-daemon + soma-agentd)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml)
[![Release bundle](https://github.com/stephane-segning/soma/actions/workflows/release.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release.yml)
[![Build backend Docker images](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml)

Soma is a local-first collaboration platform built around a desktop daemon, Electron apps, and optional peer/network infrastructure.

## What Is Here

- `backend/`: Rust workspace for `soma-daemon`, `soma-botd`, `soma-agentd`, relay/rendezvous services, shared peer/storage crates, and server utilities
- `desktop/soma`: the main Electron desktop app
- `desktop/tapia`: a lighter Electron app with a smaller current feature surface
- `desktop/desktop-*`: shared desktop packages for proto bindings, config, editor, data, UI, and packaging
- `proto/`: shared daemon/agent/membership contracts
- `docs/`: current documentation
- `planning/`: active plans and migration notes

## Current Runtime Shape

- `soma-daemon` is the main local backend for the desktop app: spaces, memberships, pages, documents, blobs, and peer networking
- `soma-agentd` is a local helper for chat, embeddings, rerank, and Yjs merge/drift work
- `desktop/soma` talks to both over local IPC from the Electron main process
- `soma-botd`, `soma-relayd`, and `soma-rendezvousd` are optional network/infrastructure pieces for more realistic peer flows

## Fast Start

Install dependencies from the repo root:

```bash
pnpm install
```

Then use the root `justfile` helpers:

```bash
just run-daemon
just run-agentd
just run-soma-desktop
```

Useful additional commands:

- `just run-botd`
- `just run-relayd`
- `just run-rendezvousd`
- `just test-backend`
- `just test-desktop-all`

For a fuller walkthrough, see `docs/src/getting-started/index.md`.

## Repository Notes

- `planning/` contains active plans and cutover notes; it is not the canonical documentation surface
- `docs/` is being narrowed to current, implemented, or finished behavior only
- the shared desktop config package normalizes stage-specific socket paths such as `/tmp/soma-daemon-dev.sock` and `/tmp/soma-agentd-dev.sock`

## Docker Compose

- Default stack: `docker compose up -d`
- If your Compose version does not support `include`, use:

```bash
docker compose -f compose/backend.infra.yml -f compose/backend.botd.yml -f compose/backend.bffd.yml up -d
```

## License

This project is available under the terms of the MIT License. See `LICENSE`.
