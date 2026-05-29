# justfile helper summary

This repository exposes a root `justfile` as a convenience layer across the monorepo. It is intentionally a thin delegator now, not a replacement for the owning toolchains inside `backend/` and `desktop/`.

Ownership split:

- `backend/` owns Cargo builds, tests, and `cargo xtask`
- `desktop/` owns pnpm installs, the Tauri desktop build, docs package builds, and packaging
- the root `justfile` provides stable, easy-to-remember entry points while those boundaries are being made clearer

Note: CI-critical automation uses `cargo xtask` for Cargo workspace tasks (see `docs/src/development/xtask.md`). Release builds live in `.github/workflows/release-desktop.yml` (the Tauri `desktop/desktop-app` bundles via `tauri-action`, signed/notarized on macOS) and `.github/workflows/release-server.yml` (`somad` Docker image to GHCR). The `justfile` remains shorthand for local development and light CI aggregation.

## Preferred grouped targets

- **Backend builds / runs** – `just backend-build-servers`, `just backend-run-bot`, `just backend-run-relay`, `just backend-run-rendezvous`, `just backend-run-bff`, `just backend-run-all` (all server subcommands dispatch to the single `somad` binary). (A leftover `backend-build-node-addon` recipe targeting the removed `@soma/node` napi addon is stale and slated for cleanup with the justfile.)
- **Backend tests / xtask** – `just backend-test`, `just backend-test-relay-smoke`, `just backend-test-rendezvous-smoke`, `just backend-xtask-help`, `just backend-xtask-version-workspace`
- **Desktop workspace** – `just desktop-install`, `just desktop-run-soma` (Tauri dev loop), `just desktop-build-soma` (Tauri bundle), `just desktop-test-soma`, `just desktop-test-all`
- **Docs / shared publish helpers** – `just docs-build`
- **Compose helpers** – `just compose-up`, `just compose-logs`, `just compose-ps`, `just compose-down`
- **CI aggregations** – `just ci-backend`, `just ci-desktop`, `just ci-verify`
- **Helpers** – `just help` (prints the full recipe list)

If you need to extend workflows, prefer keeping the real command in the owning workspace and then add a small delegating recipe at the repo root only if it improves discoverability.

## Transitional aliases

Older unprefixed names such as `just run-daemon`, `just test-backend`, and `just run-soma-desktop` still exist for compatibility.

Treat them as transitional aliases. New docs and new automation should prefer the grouped names so backend-vs-desktop ownership stays obvious.

## Desktop icons

The Tauri app's bundle icons live at `desktop/desktop-app/src-tauri/icons/`
(`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`,
`icon.png`). Regenerate them from a single 1024×1024 source with Tauri's own
tooling (`pnpm --filter @soma/desktop-app exec tauri icon /path/to/icon.png`),
which writes the full icon set into `src-tauri/icons/`. (The Cargo icon crate
lives at `desktop/desktop-icons`.)

## When to use the root `justfile`

Use the root `justfile` when you want:

- one command from the repo root for common local workflows
- grouped backend vs desktop entry points that are easy to discover
- light CI aggregation without hiding which workspace owns the underlying commands

Skip the root `justfile` and work directly in `backend/` or `desktop/` when you are doing deeper workflow development for that area.

## Shell ergonomics

`just` works across shells, but contributors on `zsh` benefit from [JBarberU/zsh-justfile](https://github.com/JBarberU/zsh-justfile). Installing that plugin adds tab completion, descriptions, and the ability to list known recipes without memorizing names.
