# Soma

[![Release Docs and Desktop Packages](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-pages.yml)
[![Release desktop (Soma)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-desktop.yml)
[![Release daemons (soma-daemon + soma-agentd)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release-daemons.yml)
[![Release bundle](https://github.com/stephane-segning/soma/actions/workflows/release.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/release.yml)
[![Build backend Docker images](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml/badge.svg)](https://github.com/stephane-segning/soma/actions/workflows/docker-backend.yml)

Soma is a local-first learning and collaboration platform for schools.

This repository is organized as a monorepo with clear boundaries between:
- product requirements (`prd/`)
- documentation (`docs/`)
- shared protocol definitions (`proto/`)
- backend Rust workspace (`backend/`)
- desktop application (`desktop/`)
- always-on server components (`server/`)
- deployment artifacts (`deploy/`)
- software bill of materials tooling (`sbom/`)

## Docker Compose

- Default stack: `docker compose up -d`
- If your Docker Compose version does not support `include` (Compose v2.20+), use:
  - `docker compose -f compose/backend.infra.yml -f compose/backend.botd.yml -f compose/backend.bffd.yml up -d`
