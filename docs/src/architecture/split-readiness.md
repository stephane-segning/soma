# Repo Split Readiness Roadmap

This document tracks the phased approach to making the monorepo structurally ready for a future split into backend-only and desktop-only repositories.

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Freeze Interfaces | **In Progress** | Define and document contracts |
| 2. Extract Contracts | Pending | Move proto to separate package/repo |
| 3. Decouple Packaging | In Progress | Explicit release manifests |
| 4. Split Tooling | Pending | Separate CI/tooling per domain |
| 5. Repo Split | Pending | Physical split into separate repos |

## Phase 1: Freeze Interfaces

**Goal**: The split boundary is a documented contract, not repo folklore.

### Checklist

- [x] Inventory shared proto files (`proto/`)
- [x] Document generated SDK locations and exports
- [x] Document socket naming conventions
- [x] Document stage detection behavior
- [x] Document event semantics (`DaemonEvent` types)
- [x] Document artifact naming conventions
- [x] Document release tag patterns
- [x] Create `shared-contracts.md` documentation

### Deliverables

1. `docs/src/architecture/shared-contracts.md` - Complete contract specification

## Phase 2: Extract Contracts

**Goal**: Backend and desktop can consume published contracts without repo-relative generation.

### In-Monorepo Groundwork

Before the repo split, the monorepo should first behave as if contracts could live elsewhere. That groundwork is intentionally small and non-destructive:

- standardize `proto/` as the only source-of-truth contract root
- document Rust and TypeScript codegen entrypoints and outputs
- allow generators to target an alternate proto checkout via `SOMA_PROTO_ROOT`
- remove accidental path drift in consumer configs where practical

This groundwork can be complete before any new `soma-contracts` repository exists.

### Tasks

1. **Create `soma-contracts` repository**
   - Move `proto/` to new repo
   - Set up CI for proto lint/validation

2. **Publish generated Rust SDK**
   - Create `soma-proto` crate in contracts repo
   - Publish to crates.io or private registry
   - Update backend to consume published crate

3. **Publish generated TypeScript SDK**
   - Create `@soma/proto` package in contracts repo
   - Publish to npm or private registry
   - Update desktop to consume published package

4. **Define compatibility policy**
   - Semantic versioning for proto changes
   - Deprecation timeline for RPC changes
   - Breaking change documentation requirements

### Checklist

- [x] Document current contract boundary and generation paths
- [x] Add portable proto-root overrides for Rust and TypeScript codegen
- [x] Include `space/v1/membership.proto` in the TypeScript generation entrypoint set
- [ ] `soma-contracts` repo created
- [ ] Proto files moved to contracts repo
- [ ] Rust SDK published and consumed by backend
- [ ] TypeScript SDK published and consumed by desktop
- [ ] Compatibility policy documented

### Post-Phase State

```
soma-contracts/
├── proto/
│   ├── daemon/v1/
│   ├── agent/v1/
│   └── space/v1/
├── rust/
│   └── soma-proto/           # Published crate
└── ts/
    └── @soma/proto/          # Published npm package
```

## Phase 3: Decouple Packaging and Release Discovery

**Goal**: Packaging can consume released artifacts from separate repos cleanly.

### Current Coupling

The packaging CLI (`desktop/packaging`) currently:
- Scrapes same-repo GitHub releases for `daemons-v*` and `desktop-v*` tags
- Relies on repo-relative paths for templates
- Assumes monorepo checkout for local builds

### Target State

1. **Explicit release manifest**
   - Each release publishes a `manifest.json` with artifact metadata
   - Packaging consumes manifests instead of scraping tags

2. **Cross-repo artifact discovery**
    - Packaging accepts `--daemons-repo` and `--desktop-repo` flags
    - Downloads artifacts from specified repos via GitHub API

3. **Manifest-first release discovery**
   - Packaging accepts `--daemons-manifest` and `--desktop-manifest`
   - If no explicit manifest is passed, packaging prefers release-published manifest assets before falling back to legacy asset-name matching

4. **Standalone template package**
    - Templates extracted to `@soma/packaging-templates` (optional)
    - Or templates remain in packaging repo

### Manifest Schema

```json
{
  "release_type": "daemons",
  "version": "0.1.0",
  "tag": "daemons-v0.1.0",
  "artifacts": [
    {
      "name": "soma-daemon-0.1.0-linux-amd64.tar.gz",
      "os": "linux",
      "arch": "amd64",
      "url": "https://github.com/.../releases/download/.../..."
    }
  ]
}
```

### Checklist

- [x] Release manifest schema defined
- [x] Daemons release workflow publishes manifest
- [x] Desktop release workflow publishes manifest
- [x] Packaging CLI accepts cross-repo flags
- [x] Packaging CLI consumes manifests

### Groundwork Landed

- `desktop/packaging` now accepts split-source flags: `--daemons-repo`, `--desktop-repo`, `--daemons-manifest`, and `--desktop-manifest`.
- Release discovery still supports current `daemons-v*` / `desktop-v*` tags, but it now prefers explicit manifest assets when present.
- `release-daemons.yml` and `release-desktop.yml` publish deterministic `*-release-manifest.json` assets.
- `release.yml` and `.github/actions/build-release-bundle/action.yml` forward the new repo/manifest inputs into the packaging CLI.
- Bundle outputs now include `bundle-release-manifest.json` so downstream automation can inspect upstream provenance.

### Remaining Follow-up

- Stop defaulting bundle release metadata (`docs_url`, homepage assumptions, install helper links) to a single monorepo GitHub Pages site.
- Teach any future split repos to publish checksums/signatures directly in the manifest instead of requiring asset-name conventions.
- Decide whether templates stay in-tree or move to a standalone `@soma/packaging-templates` package.

## Phase 4: Split Tooling and CI

**Goal**: Backend and desktop can build/test/release independently.

### Current Shared Tooling

| Tool | Location | Coupling |
|------|----------|----------|
| Root `justfile` | `/justfile` | Commands for both domains |
| Root `package.json` | `/package.json` | Workspace root |
| `pnpm-workspace.yaml` | `/pnpm-workspace.yaml` | Defines workspace |
| CI workflows | `.github/workflows/` | Mixed backend/desktop |
| Docs | `docs/` | Shared site |

### Target State

1. **Separate Justfiles**
   - `backend/justfile` for Rust commands
   - `desktop/justfile` for TypeScript commands
   - Root `justfile` delegates or removed

2. **Separate CI Workflows**
   - Backend: build, test, release daemons
   - Desktop: build, test, release apps
   - Contracts: proto validation, SDK publishing

3. **Docs Ownership**
   - Option A: Separate docs per repo
   - Option B: Shared docs in `soma-docs` repo
   - Option C: Each repo has its own docs, aggregated

### Checklist

- [ ] Backend has standalone justfile
- [ ] Desktop has standalone justfile
- [ ] Backend CI workflows self-contained
- [ ] Desktop CI workflows self-contained
- [ ] Docs ownership decided and documented

## Phase 5: Repo Split

**Goal**: Both repos consume the same published contracts and released artifacts.

**Important**: Do not execute Phase 5 until Phases 1-4 are complete.

### Target Structure

```
soma-backend/
├── backend/
│   ├── bins/
│   └── crates/
├── xtask/
├── Dockerfile
├── deploy/
└── justfile

soma-desktop/
├── desktop/
│   ├── soma/
│   ├── tapia/
│   ├── desktop-ui/
│   ├── desktop-config/
│   └── packaging/
└── justfile

soma-contracts/
├── proto/
├── rust/soma-proto/
└── ts/@soma/proto/
```

### Migration Steps

1. Create `soma-backend` repo, move `backend/`, `xtask/`, Docker assets
2. Create `soma-desktop` repo, move `desktop/`
3. Update both repos to consume published `soma-proto`/`@soma/proto`
4. Verify CI/build/release works independently
5. Archive or deprecate monorepo

### Checklist

- [ ] `soma-backend` repo created
- [ ] `soma-desktop` repo created
- [ ] Both repos build successfully
- [ ] Both repos release successfully
- [ ] Monorepo archived

## High-Risk Areas

These areas require extra attention before split:

| Area | Risk | Mitigation |
|------|------|------------|
| Daemon/Agent IPC | Breaking changes break desktop | Version negotiation, compatibility checks |
| Event mapping | New events crash old clients | Ignore unknown events, document semantics |
| Packaging assumptions | Monorepo path assumptions | Explicit paths, cross-repo flags |
| Release discovery | Tag scraping fails across repos | Explicit manifests |
| Docs | Broken links after split | Audit and update all references |

## Related Documents

- [Shared Contracts](./shared-contracts.md)
- [Local Daemon gRPC](./adrs/0001-local-daemon-grpc.md)
- [Deployment](./deployment.md)
