# Desktop Configuration Service

`@soma/desktop-config` is the shared stage-detection + path-normalization layer
for the Soma desktop app (the Tauri V2 app at `desktop/desktop-app`).

It centralizes:

- stage detection (dev / staging / prod)
- stage-specific data paths

> **Note:** the implementation in `src/stage-config.ts` still carries
> Electron-era code (it imports `electron` and adjusts Electron app paths)
> from before the Tauri migration. The Tauri host does not load it as-is; this
> package needs a pass to align with the Tauri data-path conventions
> (`@soma/desktop-config` is the intended home for stage detection +
> Tauri path normalization). Flagged for follow-up.

Package location:

- `desktop/desktop-config/`

Main implementation:

- `desktop/desktop-config/src/stage-config.ts`

## What It Does

`StageConfigService` resolves a runtime stage and then adjusts Electron paths
to keep dev, staging, and prod installs isolated from each other.

For non-prod stages it rewrites Electron paths such as:

- `appData`
- `userData`
- `sessionData`
- `logs`
- `cache`
- `crashDumps`

It also updates the app name with the stage suffix.

## Stage Resolution

The service resolves stage from:

1. explicit environment overrides when allowed
2. stage suffix in the packaged app name
3. `dev` when running unpackaged in development
4. otherwise `prod`

Important behavior:

- packaged apps ignore normal env overrides by default
- unpackaged/dev runs allow env overrides
- `production` normalizes to `prod`

## Daemon transport

The daemon and agent runtimes are embedded in the Tauri `src-tauri` host (via
the `desktop-daemon` / `desktop-agent` crates) and run in-process. There is no
daemon socket and no separate daemon process — historical fields like socket
paths and `SOMA_DAEMON_SOCKET` / `SOMA_AGENTD_SOCKET` are gone.

## Current Package Shape

The package currently exports its source entry directly:

- `desktop/desktop-config/package.json`

So the important source of truth is the implementation in `src/stage-config.ts`.
