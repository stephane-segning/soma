# justfile helper summary

This repository exposes a `justfile` at the workspace root that captures recommended build/run/test flows across the backend, desktop apps, and compose stack.

Note: CI-critical automation is moving to `cargo xtask` (see `docs/src/development/xtask.md`). The `justfile` remains a convenient shorthand for local development.

## Run targets

- **Daemon builds / runs** – `just build-daemons`, `just run-daemon`, `just run-agentd`
- **Server builds / runs** – `just build-servers`, `just run-botd`, `just run-relayd`, `just run-rendezvousd`, `just run-bffd`, `just run-serverd`
- **Compose helpers** – `just compose-up`, `just compose-logs`, `just compose-ps`, `just compose-down`
- **Tests** – `just test-backend`, `just test-relayd-smoke`, `just test-rendezvousd-smoke`, `just test-desktop-soma`, `just test-desktop-tapia`, `just test-desktop-all`
- **Desktop icons (Soma)** – `just icons-soma`
- **Helpers** – `just help` (prints the full recipe list)

If you need to extend workflows (e.g., add arguments or new targets), update the root `justfile` so everyone shares the same shorthand.

## Desktop icon updates (Soma)

`desktp-icons` generates PNG, ICNS, and ICO assets from a single 1024x1024 PNG or SVG. The `justfile` includes recipes that wire it into the desktop app layouts:

- **Electron Soma (`desktop/soma`)** – `just icons-soma /path/to/icon.png` (or `.svg`)
  - Writes into `desktop/soma/build/icons` and copies the output into `desktop/soma/build/icon.icns`, `desktop/soma/build/icon.ico`, and `desktop/soma/build/icon.png`.
  - Writes `desktop/soma/build/icon-legacy.icns` for the dev dock icon (legacy ICNS encoding).
  - Updates the runtime window icon at `desktop/soma/resources/icon.png`.
  - Updates the renderer favicon at `desktop/soma/src/renderer/public/icon.png`.
- **Electron Tapia (`desktop/tapia`)** – `just icons-tapia /path/to/icon.png` (or `.svg`)
  - Writes into `desktop/tapia/build/icons` and copies the output into `desktop/tapia/build/icon.icns`, `desktop/tapia/build/icon.ico`, and `desktop/tapia/build/icon.png`.
  - Writes `desktop/tapia/build/icon-legacy.icns` for the dev dock icon (legacy ICNS encoding).
  - Updates the runtime window icon at `desktop/tapia/resources/icon.png`.
  - Updates the renderer favicon at `desktop/tapia/src/renderer/public/icon.png`.
Note: these recipes take a single positional path argument; `just` treats `--input` as another recipe name.

## Shell ergonomics

`just` works across shells, but contributors on `zsh` benefit from [JBarberU/zsh-justfile](https://github.com/JBarberU/zsh-justfile). Installing that plugin adds tab completion, descriptions, and the ability to list known recipes without memorizing names.
