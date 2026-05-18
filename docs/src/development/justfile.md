# justfile helper summary

This repository exposes a root `justfile` as a convenience layer across the monorepo. It is intentionally a thin delegator now, not a replacement for the owning toolchains inside `backend/` and `desktop/`.

Ownership split:

- `backend/` owns Cargo builds, tests, and `cargo xtask`
- `desktop/` owns pnpm installs, Electron builds, docs package builds, and packaging
- the root `justfile` provides stable, easy-to-remember entry points while those boundaries are being made clearer

Note: CI-critical automation uses `cargo xtask` for Cargo workspace tasks (see `docs/src/development/xtask.md`). Release builds live in `.github/workflows/release-desktop.yml` (Electron app + native addon, signed/notarized on macOS) and `.github/workflows/release-server.yml` (`somad` Docker image to GHCR). The `justfile` remains shorthand for local development and light CI aggregation.

## Preferred grouped targets

- **Backend builds / runs** – `just backend-build-daemons`, `just backend-run-daemon`, `just backend-run-agentd`, `just backend-build-servers`, `just backend-run-bot`, `just backend-run-relay`, `just backend-run-rendezvous`, `just backend-run-bff` (all server subcommands dispatch to the single `somad` binary)
- **Backend tests / xtask** – `just backend-test`, `just backend-test-relay-smoke`, `just backend-test-rendezvous-smoke`, `just backend-xtask-help`, `just backend-xtask-version-workspace`
- **Desktop workspace** – `just desktop-install`, `just desktop-run-soma`, `just desktop-build-soma`, `just desktop-test-soma`, `just desktop-test-all`
- **Desktop icons** – `just desktop-icons-soma`
- **Docs / shared publish helpers** – `just docs-build`
- **Compose helpers** – `just compose-up`, `just compose-logs`, `just compose-ps`, `just compose-down`
- **CI aggregations** – `just ci-backend`, `just ci-desktop`, `just ci-verify`
- **Helpers** – `just help` (prints the full recipe list)

If you need to extend workflows, prefer keeping the real command in the owning workspace and then add a small delegating recipe at the repo root only if it improves discoverability.

## Transitional aliases

Older unprefixed names such as `just run-daemon`, `just test-backend`, and `just run-soma-desktop` still exist for compatibility.

Treat them as transitional aliases. New docs and new automation should prefer the grouped names so backend-vs-desktop ownership stays obvious.

## Desktop icon updates

`cargo icons` generates PNG, ICNS, and ICO assets from a single 1024x1024 PNG or SVG. The root `justfile` keeps icon generation here because it spans Cargo tooling and desktop asset locations:

- **Electron Soma (`desktop/soma`)** – `just desktop-icons-soma /path/to/icon.png` (or `.svg`)
  - Writes into `desktop/soma/build/icons` and copies the output into `desktop/soma/build/icon.icns`, `desktop/soma/build/icon.ico`, and `desktop/soma/build/icon.png`.
  - Writes `desktop/soma/build/icon-legacy.icns` for the dev dock icon (legacy ICNS encoding).
  - Updates the runtime window icon at `desktop/soma/resources/icon.png`.
  - Updates the renderer favicon at `desktop/soma/src/renderer/public/icon.png`.

Note: this recipe takes a single positional path argument; `just` treats `--input` as another recipe name.

## When to use the root `justfile`

Use the root `justfile` when you want:

- one command from the repo root for common local workflows
- grouped backend vs desktop entry points that are easy to discover
- light CI aggregation without hiding which workspace owns the underlying commands

Skip the root `justfile` and work directly in `backend/` or `desktop/` when you are doing deeper workflow development for that area.

## Shell ergonomics

`just` works across shells, but contributors on `zsh` benefit from [JBarberU/zsh-justfile](https://github.com/JBarberU/zsh-justfile). Installing that plugin adds tab completion, descriptions, and the ability to list known recipes without memorizing names.
