# Desktop configuration service

`@soma/desktop-config` packages shared desktop runtime wiring used by both Soma and Tapia. It centralizes stage detection, path overrides, and socket naming so each build can opt into dev/staging modes without touching multiple codebases.

## Build-time setup

- The package lives under `desktop/desktp-config/` and exports `StageConfigService`. Its TypeScript source compiles to `dist/stage-config.js`/`.d.ts`, which is then imported by the Electron main entries.
- The Soma/Tapia scripts now run `pnpm --filter @soma/desktop-config run build` before typechecking/building, ensuring the latest shared logic is available when bundling or running the apps.
- Each stage build (dev/staging/prod) also has a matching electron-builder config (`desktop/soma/electron-builder.{dev,staging}.yml` and the Tapia equivalents) so the packaged vendors get stage-specific `appId`/`productName` plus the hardened runtime entitlements.

## Stage detection

`StageConfigService` chooses a stage name from the following sources (in priority order):

1. `SOMA_STAGE` / `TAPIA_STAGE` (dev only; ignored when `app.isPackaged`).
2. `SOMA_CHANNEL` (dev only).
3. Stage suffix derived from the packaged app name (`soma-dev`, `tapia-staging`, ...).
4. `dev` when running via `electron-vite dev`.

Production builds always resolve to `prod` and ignore environment overrides.

## Runtime behavior

For non-prod stages the service rewrites Electron paths to stage-prefixed directories:

- `appData` → `<normal appData>/<appPrefix>-<stage>`
- `userData` / `sessionData` / `logs` / `cache` / `crashDumps` → nested folders under that stage root
- `app.setName` is updated to include the stage suffix so dock/taskbar entries stay distinct

This keeps logs, cache, and SQLite data directories isolated per stage and avoids corrupting production stores.

### Socket files

The service also normalizes the unix sockets used for daemon communication:

| Stage | Daemon socket | Agent socket |
|-------|---------------|--------------|
| prod  | `/tmp/soma-daemon.sock` | `/tmp/soma-agentd.sock` |
| dev | `/tmp/soma-daemon-dev.sock` | `/tmp/soma-agentd-dev.sock` |
| staging | `/tmp/soma-daemon-staging.sock` | `/tmp/soma-agentd-staging.sock` |

The defaults are overridable via `SOMA_DAEMON_SOCKET` / `TAPIA_DAEMON_SOCKET` and corresponding agent vars, but only when running unpackaged (dev). Packaged builds always use the built-in paths, so install scripts should start daemons with the matching `--socket-path` flag (or run the per-stage packaging bundle that sets up the sockets for you).

## What to keep in mind

- When running local stage builds (`pnpm --filter soma run build:mac:dev`, etc.), make sure a `soma-daemon` instance listens on `/tmp/soma-daemon-dev.sock` (or provide `--socket-path`).
- The shared package makes the stage logic available to Tapia as well, so both apps can share the same stage-specific daemons when they run side-by-side.
