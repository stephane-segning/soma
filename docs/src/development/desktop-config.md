# Desktop Configuration Service

`@soma/desktop-config` is the shared Electron runtime config layer for the
Soma desktop app (which now also houses the `/practice` Tapia surface).

It centralizes:

- stage detection (dev / staging / prod)
- stage-specific Electron data paths

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

The daemon and agent runtimes are linked into the `@soma/node` napi addon and
loaded in-process by the Electron main process. There is no daemon socket and
no separate daemon process — historical fields like socket paths and
`SOMA_DAEMON_SOCKET` / `SOMA_AGENTD_SOCKET` are gone.

## Current Package Shape

The package currently exports its source entry directly:

- `desktop/desktop-config/package.json`

So the important source of truth is the implementation in `src/stage-config.ts`.
