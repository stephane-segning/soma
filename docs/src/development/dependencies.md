# Dependency and Workspace Policy

This repository uses Cargo workspaces and a single source of truth for dependency versions.

## Rust (Cargo)

- **All third-party dependency versions live in** the repo root `Cargo.toml` under `[workspace.dependencies]`.
- **Every crate and binary** under `backend/crates/*` and `backend/bins/*` must depend on third-party crates using:
  - `crate-name = { workspace = true }`
  - add `features = [...]` in the leaf crate if needed.
- **Do not** put `version = "..."` for third-party crates in leaf `Cargo.toml` files.

This keeps dependency upgrades simple, avoids version skew, and makes feature usage explicit at the call site.

## Current status

- New third-party dependencies should be added to root `Cargo.toml` first, then consumed in leaf crates with `{ workspace = true }`.
- Existing non-compliant leaf pins should be treated as migration debt and removed opportunistically when touching that crate.

## Desktop (pnpm)

- Desktop dependencies are managed via the `pnpm` workspace under `desktop/`.
- Install and run scripts via `pnpm` (not `npm`).

## Docs (VitePress)

Docs are built with VitePress (Node-based) from the `docs/src` markdown tree via the `@soma/docs` workspace package. Use the root scripts (or `pnpm --filter @soma/docs run dev/build` directly):

```bash
pnpm docs:dev     # dev server
pnpm docs:build   # outputs to ./site
```

## Repo automation (`cargo xtask`)

Repo automation lives in `xtask/` and is invoked via `cargo xtask ...` (wired through `.cargo/config.toml`). CI uses this for Cargo workspace version resolution; bundle packaging is handled by the TypeScript CLI under `desktop/packaging`.
