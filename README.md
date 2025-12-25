# Soma

[![Release Docs and Desktop Packages](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml)
[![Release desktop (Soma)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml)
[![Release daemons (soma-daemon + soma-agentd)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml)
[![Release bundle](https://github.com/stephane-segning/soma/actions/workflows/release.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release.yml)
[![Build backend Docker images](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml)

Soma is a local-first learning and collaboration platform for schools.

This repository is organized as a monorepo with clear boundaries between:
- backend Rust workspace (`backend/`)
- desktop applications (`desktop/`)
- deployment artifacts (`deploy/`)
- Docker Compose bundles (`compose/`)
- shared protocol definitions (`proto/`)
- documentation (`docs/`)
- product requirements (`prd/`)

## Docker Compose

- The Compose setup uses `compose.yml` to include the stack definitions under `compose/` (Compose v2.20+).
- Default stack: `docker compose up -d`
- If your Docker Compose version does not support `include` (Compose v2.20+), use:
  - `docker compose -f compose/backend.infra.yml -f compose/backend.botd.yml -f compose/backend.bffd.yml up -d`
