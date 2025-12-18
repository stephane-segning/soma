# Dependency and Workspace Policy

This repository uses Cargo workspaces and a single source of truth for dependency versions.

## Rust (Cargo)

- **All third-party dependency versions live in** `backend/Cargo.toml` under `[workspace.dependencies]`.
- **Every crate and binary** under `backend/crates/*` and `backend/bins/*` must depend on third-party crates using:
  - `crate-name = { workspace = true }`
  - add `features = [...]` in the leaf crate if needed.
- **Do not** put `version = "..."` for third-party crates in leaf `Cargo.toml` files.

This keeps dependency upgrades simple, avoids version skew, and makes feature usage explicit at the call site.

## Desktop (pnpm)

- Desktop dependencies are managed via the `pnpm` workspace under `desktop/app/`.
- Install and run scripts via `pnpm` (not `npm`).

