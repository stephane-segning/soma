# Desktop Configuration Service

`@soma/desktop-config` is the shared stage-detection + path-normalization layer
for the Soma desktop app (the Tauri V2 app at `desktop/desktop-app`).

It centralizes:

- stage detection (dev / staging / prod)
- stage-specific data paths

Package location:

- `desktop/desktop-config/`

Main implementation:

- `desktop/desktop-config/src/stage-config.ts`

## What It Does

`StageConfigService` (or the `resolveStageConfig` convenience function) resolves
a runtime stage and the normalized data paths that keep dev, staging, and prod
installs isolated from each other. It is framework-agnostic: it depends only on
`node:os` and `node:path`, with no `electron` import and no socket plumbing.

Calling `resolve()` returns a `StageRuntimeConfig`:

- `stage` — `"dev" | "staging" | "prod"`
- `dataDir` — the stage-specific data root
- `databasePath` — the single SQLite file inside `dataDir` (default `soma.db`)
- `logsDir` — `dataDir/logs`
- `cacheDir` — `dataDir/cache`

It computes paths; it does not create directories or mutate any host process
state.

## Path Normalization

The data root follows each platform's convention, with a `-<stage>` suffix for
non-prod stages:

| Platform | Prod root | Non-prod example |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Soma` | `~/Library/Application Support/Soma-dev` |
| Linux | `$XDG_DATA_HOME/soma` (falls back to `~/.local/share/soma`) | `~/.local/share/soma-staging` |
| Windows | `%APPDATA%/Soma` (falls back to `~/AppData/Roaming/Soma`) | `%APPDATA%/Soma-dev` |

The macOS/Windows folder name comes from `appName` (default `Soma`); the
Linux/XDG name comes from `unixAppName` (default `appName.toLowerCase()`).

## Stage Resolution

The service resolves stage from, in order:

1. an explicit environment override (`SOMA_STAGE` / `SOMA_CHANNEL` by default)
2. a `-<stage>` suffix on the packaged product name, when `appNameForStage` is
   supplied (e.g. `Soma-staging` → `staging`)
3. `dev` when `isDev` is set
4. otherwise `prod`

`normalizeStage` maps common aliases — `production`/`release` → `prod`,
`development`/`debug` → `dev`, `stage`/`beta`/`canary` → `staging` — and any
unrecognized value falls back to `prod`.

The platform, home directory, and environment can all be injected through
`StageConfigOptions` (`platform`, `homeDir`, `env`) for testing.

## Daemon transport

The daemon and agent runtimes are embedded in the Tauri `src-tauri` host (via
the `desktop-daemon` / `desktop-agent` crates) and run in-process. There is no
daemon socket and no separate daemon process — historical fields like socket
paths and `SOMA_DAEMON_SOCKET` / `SOMA_AGENTD_SOCKET` are gone.

## Current Package Shape

The package builds with `tsc` and ships its compiled `dist/` entry:

- `desktop/desktop-config/package.json` — `main`/`types` point at
  `dist/stage-config.{js,d.ts}`
- the source of truth is `src/stage-config.ts`
