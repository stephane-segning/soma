# Repo Split Readiness

This document tracks what a future split of the monorepo into separate backend and desktop repos would actually require, post-architectural-collapse (PRs #41–#48). The collapse resolved many of the original blockers; what's left is small.

## Status: deferred, not blocked

The split is **not** on any roadmap right now. The collapse removed most of the original coupling — there is no shared proto SDK, no cross-product packaging CLI, no daemon/agent gRPC contract surface between backend and desktop. The remaining coupling is narrow enough that a split would be a mechanical move, not an architectural project.

## Why most of the old blockers are gone

Pre-collapse, the split was blocked by:

| Blocker (pre-collapse) | Status now |
|---|---|
| Shared `proto/` source consumed by both Rust and TypeScript | Mostly resolved. `proto/` is now used only for libp2p wire formats (Rust-only). The Electron main process no longer consumes generated TS types — it calls the addon directly. `desktop/desktop-proto` (`@soma/proto`) still exists in `pnpm-workspace.yaml` and is built by `pnpm run contracts:ts`, but no Soma code depends on it; it is slated for removal per the target architecture (AGENTS.md). |
| Daemon/agent IPC contracts consumed by desktop | Resolved. The Electron main process loads the `@soma/node` napi addon and calls Rust functions directly. No gRPC, no Unix sockets, no shared TS types beyond `napi build --dts` output that ships *with* the addon. |
| `desktop/packaging` CLI assuming one repo namespace | Resolved. `desktop/packaging` was deleted in P6a. Packaging is now per-artifact: `electron-builder` for the desktop app, the multi-arch `Dockerfile` for `somad`. No cross-product bundler. |
| Release manifest schema for cross-repo discovery | No longer needed. Desktop assets are published to `desktop-v*` Releases (with `SHA256SUMS`); the server image is published to `ghcr.io/<owner>/somad`. Each release stands alone. |
| `release.yml` orchestrating both backend and desktop | Resolved. `release-desktop.yml` and `release-server.yml` are independent, each driven by `.github/targets.json`. |
| Install/uninstall bootstrap scripts coupling release URLs | Resolved. Retired in P6a; users download directly from GitHub Releases. |

## What's actually left

The remaining coupling between `backend/` and `desktop/` after the collapse:

- **`@soma/node` build-time link.** `desktop/soma`'s Electron bundle embeds `soma-node.<os>-<arch>.node`, which is built from `backend/crates/soma-node`. In a split, the desktop repo would either need to publish the addon as an npm package from the backend repo's release pipeline, or vendor the prebuilt `.node` per `(os, arch)` from a `node-v*` Release.
- **`.github/targets.json` shared (os, arch) source.** Lives at the repo root, consumed by both release workflows. Trivially duplicated or factored to a shared action if split.
- **Single `docs/` VitePress site.** Architecture, development, and security docs cover both products. A split would need to decide: one shared docs repo, or per-product docs with separate sites.
- **Root pnpm/Cargo workspace files.** `Cargo.toml`, `pnpm-workspace.yaml`, `package.json` at the root would dissolve into per-repo equivalents.
- **`xtask/` lives at the repo root** alongside `backend/`. Trivially moves with backend.

## If a split happens

Suggested target layout (not committed to):

```
soma-backend/
├── backend/          # Rust workspace (crates + somad + soma-node addon)
├── xtask/
├── deploy/           # Helm charts for somad
├── Dockerfile
└── .github/workflows/release-server.yml
                     # plus an addon-publishing workflow if @soma/node ships as npm

soma-desktop/
├── desktop/          # pnpm workspace (soma app + shared TS packages)
└── .github/workflows/release-desktop.yml
                     # consumes prebuilt @soma/node from soma-backend
```

Open decisions before doing this:

- Does `@soma/node` ship via npm (versioned, registered) or via GitHub Release downloads keyed by `(os, arch)`?
- Where do the docs live — one `soma-docs` repo, or split docs per product?
- Does the desktop repo build a release against arbitrary backend versions, or pin to a known-good `@soma/node` per desktop release?

## Recommendation

**Do not split now.** The remaining work is small, but there is no concrete pressure (independent release cadences, separate ownership, repo-size pain) that justifies the coordination cost. Revisit when one of those pressures appears.

## Related Documents

- [Shared Contracts](./shared-contracts.md) — what crosses the language boundary inside the monorepo today
- [Deployment](./deployment.md) — current packaging and release pipelines
- [V2 Clarity Plan](/02-v2) — the thinking that drove the architectural collapse
