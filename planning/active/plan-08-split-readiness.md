# Plan 08: Backend/Desktop Split Readiness

Goal: track what would be required to split this monorepo into separate backend and desktop repos. The architectural collapse (PRs #41–#48) resolved most of the original blockers, so this plan is now mostly a "what would be left" inventory rather than an active work item.

Important recommendation:

> do not split now; the remaining coupling is small but there is no concrete pressure (independent release cadences, separate ownership, repo-size pain) that justifies the coordination cost. Revisit when one of those pressures appears.

## Status

Post-collapse, most pre-existing phases became moot. The published doc lives at `docs/src/architecture/split-readiness.md`; this file is the planning-side reflection.

| Pre-collapse phase | Outcome |
|---|---|
| 1. Freeze interfaces | Subsumed by the collapse. The boundary between backend and desktop is now napi (`@soma/node`), not gRPC + sockets. |
| 2. Extract contracts (`proto/` → published SDK) | Not needed. `proto/` is libp2p-only, Rust-only. `desktop/desktop-proto` deleted in P4. |
| 3. Decouple packaging | Subsumed. `desktop/packaging` deleted in P6a; packaging is per-artifact (electron-builder, multi-arch Dockerfile). |
| 4. Split tooling and CI | Largely done. `release-desktop.yml` and `release-server.yml` are independent and driven by `.github/targets.json`. |
| 5. Repo split | Deferred. See "What's actually left" below. |

## What's actually left

Real coupling between `backend/` and `desktop/` after the collapse:

- **`@soma/node` build-time link.** `desktop/soma`'s Electron bundle embeds `soma-node.<os>-<arch>.node`, built from `backend/crates/soma-node`. In a split, the desktop repo would either consume the addon as an npm package or vendor prebuilt `.node` files per `(os, arch)` from a `node-v*` Release.
- **`.github/targets.json`** lives at the repo root and is read by both release workflows.
- **Single `docs/` VitePress site** covers both products.
- **Root pnpm/Cargo workspace files** (`Cargo.toml`, `pnpm-workspace.yaml`, `package.json`).
- **`xtask/`** sits at the repo root, intended to move with backend.

## Open decisions before any split

- Does `@soma/node` ship via npm (registered, versioned) or via GitHub Release downloads keyed by `(os, arch)`?
- Where do the docs live — one `soma-docs` repo, or per-product docs?
- Does the desktop repo build a release against arbitrary backend versions, or pin to a known-good `@soma/node` per desktop release?

## Why this plan stays in the active folder for now

It's a small, written-down checklist of what a split would touch. Easier to keep here than to reconstruct later. Move to `planning/archive/` if a deliberate decision is made not to split.
