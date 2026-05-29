# Repo Split Readiness

This document tracks what a future split of the monorepo into separate backend and desktop repos would actually require, post-architectural-collapse and post-Tauri-migration. The collapse resolved many of the original blockers; the Tauri migration changed the remaining backend↔desktop coupling (the desktop now embeds the Rust crates directly in its `src-tauri` host rather than through a prebuilt napi addon).

## Status: deferred, not blocked

The split is **not** on any roadmap right now. The collapse removed most of the original coupling — there is no shared proto SDK, no cross-product packaging CLI, no daemon/agent gRPC contract surface between backend and desktop. The remaining coupling is narrow enough that a split would be a mechanical move, not an architectural project.

## Why most of the old blockers are gone

Pre-collapse, the split was blocked by:

| Blocker (pre-collapse) | Status now |
|---|---|
| Shared `proto/` source consumed by both Rust and TypeScript | Resolved. `proto/` is now used only for libp2p wire formats (Rust-only). `desktop/desktop-proto` (`@soma/proto`) was removed with the Electron app; the renderer's TypeScript wire types are generated from the Rust command graph via `tauri-specta` into `@soma/sdk`. |
| Daemon/agent IPC contracts consumed by desktop | Resolved. The Tauri `src-tauri` host embeds the `soma-daemon` / `soma-agentd` crates as libraries (via `desktop-daemon` / `desktop-agent`) and calls them in-process. No gRPC, no Unix sockets, no napi addon; the renderer talks to the host over Tauri commands (`@soma/sdk`). |
| `desktop/packaging` CLI assuming one repo namespace | Resolved. `desktop/packaging` was deleted in P6a. Packaging is now per-artifact: the **Tauri bundler** for the desktop app, the multi-arch `Dockerfile` for `somad`. No cross-product bundler. |
| Release manifest schema for cross-repo discovery | No longer needed. Desktop assets are published to `desktop-v*` Releases (with `SHA256SUMS`); the server image is published to `ghcr.io/<owner>/somad`. Each release stands alone. |
| `release.yml` orchestrating both backend and desktop | Resolved. `release-desktop.yml` and `release-server.yml` are independent, each driven by `.github/targets.json`. |
| Install/uninstall bootstrap scripts coupling release URLs | Resolved. Retired in P6a; users download directly from GitHub Releases. |

## What's actually left

The remaining coupling between `backend/` and `desktop/` after the collapse:

- **Shared Cargo workspace link.** The Tauri host (`desktop/desktop-app/src-tauri` + the `desktop-*` crates) depends on the backend runtime crates (`soma-daemon`, `soma-agentd`, and their dependencies) as path dependencies in the root Cargo workspace. In a split, the desktop repo would need those crates published (e.g. to a private registry) or vendored, and the desktop's `src-tauri` build would consume them as versioned dependencies rather than path deps.
- **`.github/targets.json` shared (os, arch) source.** Lives at the repo root, consumed by both release workflows. Trivially duplicated or factored to a shared action if split.
- **Single `docs/` VitePress site.** Architecture, development, and security docs cover both products. A split would need to decide: one shared docs repo, or per-product docs with separate sites.
- **Root pnpm/Cargo workspace files.** `Cargo.toml`, `pnpm-workspace.yaml`, `package.json` at the root would dissolve into per-repo equivalents.
- **`xtask/` lives at the repo root** alongside `backend/`. Trivially moves with backend.

## If a split happens

Suggested target layout (not committed to):

```
soma-backend/
├── backend/          # Rust workspace (shared crates + somad)
├── xtask/
├── deploy/           # Helm charts for somad
├── Dockerfile
└── .github/workflows/release-server.yml
                     # plus a crate-publishing step if the runtime crates ship to a registry

soma-desktop/
├── desktop/          # pnpm workspace + the Tauri app's src-tauri Rust crates
└── .github/workflows/release-desktop.yml
                     # consumes the runtime crates from soma-backend (registry or vendored)
```

Open decisions before doing this:

- Do the runtime crates ship via a (private) Cargo registry, or get vendored into the desktop repo per release?
- Where do the docs live — one `soma-docs` repo, or split docs per product?
- Does the desktop repo build a release against arbitrary backend versions, or pin to a known-good set of runtime-crate versions per desktop release?

## Recommendation

**Do not split now.** The remaining work is small, but there is no concrete pressure (independent release cadences, separate ownership, repo-size pain) that justifies the coordination cost. Revisit when one of those pressures appears.

## Related Documents

- [Shared Contracts](./shared-contracts.md) — what crosses the language boundary inside the monorepo today
- [Deployment](./deployment.md) — current packaging and release pipelines
- [V2 Clarity Plan](/02-v2) — the thinking that drove the architectural collapse
