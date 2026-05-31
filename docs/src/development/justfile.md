# justfile helper summary

This repository exposes a root `justfile` as a convenience layer across the monorepo. It is intentionally a thin delegator now, not a replacement for the owning toolchains inside `backend/` and `desktop/`.

Ownership split:

- `backend/` owns Cargo builds, tests, and `cargo xtask`
- `desktop/` owns pnpm installs, Tauri builds, docs package builds, and packaging
- the root `justfile` provides stable, easy-to-remember entry points while those boundaries are being made clearer

Note: CI-critical automation uses `cargo xtask` for Cargo workspace tasks (see `docs/src/development/xtask.md`). Release builds live in `.github/workflows/release-desktop.yml` (the Tauri `desktop/desktop-app` bundles via `tauri-action`, signed/notarized on macOS) and `.github/workflows/release-server.yml` (`somad` Docker image to GHCR). The `justfile` remains shorthand for local development and light CI aggregation.

## Preferred grouped targets

- **Backend builds / runs** – `just backend-build-servers`, `just backend-run-bot`, `just backend-run-relay`, `just backend-run-rendezvous`, `just backend-run-bff`, `just backend-run-all` (all server subcommands dispatch to the single `somad` binary). `just backend-build-workspace` builds every crate + binary in the Rust workspace.
- **Backend tests / xtask** – `just backend-test`, `just backend-test-workspace`, `just backend-test-relay-smoke`, `just backend-test-rendezvous-smoke`, `just backend-xtask-help`, `just backend-xtask-version-workspace`
- **Desktop workspace** – `just desktop-install`, `just desktop-run-soma` (Tauri dev), `just desktop-build-soma` (Tauri bundle), `just desktop-test-soma`, `just desktop-test-all`, `just desktop-test-unit`, `just desktop-test-e2e`
- **Docs / shared publish helpers** – `just docs-build`
- **Compose helpers** – `just compose-up`, `just compose-logs`, `just compose-ps`, `just compose-down`
- **CI aggregations** – `just ci-backend`, `just ci-desktop`, `just ci-verify`
- **Helpers** – `just help` (prints the full recipe list)

If you need to extend workflows, prefer keeping the real command in the owning workspace and then add a small delegating recipe at the repo root only if it improves discoverability.

The unprefixed transitional aliases (`run-daemon`, `test-backend`, `run-soma-desktop`, and the per-service `run-*d` daemon names) have been removed along with the per-service backend binaries they pointed at. Use the grouped names above so backend-vs-desktop ownership stays obvious.

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
