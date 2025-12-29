# Dependency and Workspace Policy

This repository uses Cargo workspaces and a single source of truth for dependency versions.

## Rust (Cargo)

- **All third-party dependency versions live in** `backend/Cargo.toml` under `[workspace.dependencies]`.
- **Every crate and binary** under `backend/crates/*` and `backend/bins/*` must depend on third-party crates using:
  - `crate-name = { workspace = true }`
  - add `features = [...]` in the leaf crate if needed.
- **Do not** put `version = "..."` for third-party crates in leaf `Cargo.toml` files.

This keeps dependency upgrades simple, avoids version skew, and makes feature usage explicit at the call site.

## Current exceptions / follow-ups

- `derive_builder` was added to `backend/Cargo.toml` and should be used via `workspace = true`.
- Some leaf crates still specify third-party versions directly (example: `soma-bff` uses `reqwest = { version = ... }`). Prefer moving these to `[workspace.dependencies]` and switching leaf usage to `{ workspace = true }` to stay consistent.

## Desktop (pnpm)

- Desktop dependencies are managed via the `pnpm` workspace under `desktop/`.
- Install and run scripts via `pnpm` (not `npm`).

## Docs (MkDocs)

Docs are built with MkDocs using the `bootstrap386` theme (CI installs these via `.github/actions/build-mkdocs/action.yml`).

## Repo automation (`cargo xtask`)

Repo automation lives in `xtask/` and is invoked via `cargo xtask ...` (wired through `.cargo/config.toml`). This is used by CI for version resolution and bundle packaging.

Local install:

```bash
python3 -m pip install mkdocs mkdocs-material mkdocs-bootstrap386 mkdocs-mermaid2-plugin
```

Build:

```bash
just build-docs
```
