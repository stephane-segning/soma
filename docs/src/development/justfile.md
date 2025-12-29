# justfile helper summary

This repository exposes a `justfile` at the workspace root that captures recommended build/run/test flows across the backend, desktop apps, and compose stack.

Note: CI-critical automation is moving to `cargo xtask` (see `docs/src/development/xtask.md`). The `justfile` remains a convenient shorthand for local development.

## Run targets

- **Daemon builds / runs** – `just build-daemons`, `just run-daemon`, `just run-agentd`
- **Server builds / runs** – `just build-servers`, `just run-botd`, `just run-relayd`, `just run-rendezvousd`, `just run-bffd`, `just run-serverd`
- **Compose helpers** – `just compose-up`, `just compose-logs`, `just compose-ps`, `just compose-down`
- **Tests** – `just test-backend`, `just test-relayd-smoke`, `just test-rendezvousd-smoke`, `just test-desktop-soma`, `just test-desktop-tapia`, `just test-desktop-all`
- **Helpers** – `just help` (prints the full recipe list)

If you need to extend workflows (e.g., add arguments or new targets), update the root `justfile` so everyone shares the same shorthand.

## Shell ergonomics

`just` works across shells, but contributors on `zsh` benefit from [JBarberU/zsh-justfile](https://github.com/JBarberU/zsh-justfile). Installing that plugin adds tab completion, descriptions, and the ability to list known recipes without memorizing names.
