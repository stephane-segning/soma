# Plan 08: Backend/Desktop Split Readiness

Goal: make the repo structurally ready for a future split into backend-only and desktop-only repos without breaking delivery, packaging, or shared contracts.

Important recommendation:

> do not split now; first extract contracts and release boundaries

## Why this exists

The code layout is already close to split-ready, but the shared contract layer and release engineering are still monorepo-native.

Biggest blockers:

- shared `proto/` source
- generated SDKs tied to repo paths
- stage/socket/runtime conventions spread across code and packaging
- bundle packaging that assumes one repo namespace and release layout
- root tooling/docs that still assume one checkout

## Target Ownership Model

### Repo 1: `soma-contracts`

Owns:

- `proto/`
- generated Rust/TS SDK publication
- compatibility policy
- release-manifest schema
- shared runtime conventions that both backend and desktop must honor

### Repo 2: `soma-backend`

Owns:

- `backend/`
- `xtask/`
- backend Docker/release/deploy assets
- daemon/agent/server binaries
- storage/networking crates

### Repo 3: `soma-desktop`

Owns:

- `desktop/soma`
- `desktop/tapia`
- shared desktop packages

### Optional repo or platform-owned area: packaging/docs portal

Should own:

- bundle packaging if it still assembles both backend and desktop outputs
- unified cross-product docs if you keep one docs site

## What Must Be Extracted First

### Shared contracts

- `proto/`
- generated Rust crate(s)
- published `@soma/proto`

### Shared runtime conventions

- socket naming
- stage behavior
- service names
- install locations
- compatibility expectations for daemon and agent endpoints

### Shared release contract

- artifact naming
- tag naming
- machine-readable release manifest for packaging

## What Can Move Cleanly Later

### Backend-only

- `backend/`
- `xtask/`
- backend Docker assets
- backend deploy/manifests
- backend workflows

### Desktop-only

- `desktop/soma`
- `desktop/tapia`
- `desktop/desktp-config`
- `desktop/desktp-data`
- `desktop/desktp-editor`
- `desktop/desktp-ui`
- `desktop/desktp-icons`

## Things That Are Not Cleanly Movable Yet

- `proto/`
- `desktop/desktp-proto`
- `desktop/packaging`
- `docs/` if kept as one shared site
- root `justfile`
- root `package.json`
- root `pnpm-workspace.yaml`
- release workflows that assume one GitHub repo namespace

## Required Pre-Split Changes

### Phase 1: Freeze interfaces

Define and document:

- supported daemon/agent IPC versions
- socket naming rules
- event semantics
- artifact names and tags

Acceptance criteria:

- the split boundary is a documented contract, not repo folklore

### Phase 2: Extract contracts

Move `proto/` into a shared contracts package/repo and publish generated artifacts.

Acceptance criteria:

- backend and desktop can consume published contracts without repo-relative generation

### Phase 3: Decouple packaging and release discovery

Stop scraping same-repo tags and file names as implicit truth.

Replace with:

- explicit backend release manifest
- explicit desktop release manifest
- stable artifact naming contract

Acceptance criteria:

- packaging can consume released artifacts from separate repos cleanly

### Phase 4: Split tooling and CI

Break the root tooling apart:

- separate `justfile` or task runners
- separate CI validation pipelines
- separate release workflows
- updated docs ownership

Acceptance criteria:

- backend and desktop can build/test/release independently

### Phase 5: Repo split

Only after phases 1-4:

- move backend to backend repo
- move desktop to desktop repo
- keep contracts shared and versioned

Acceptance criteria:

- both repos consume the same published contracts and released artifacts

## Suggested Migration Order

1. contract inventory and compatibility policy
2. shared contracts extraction
3. artifact manifest and packaging contract
4. split docs/tooling ownership
5. backend repo split
6. desktop repo split

## High-Risk Areas To Stabilize Before Split

- daemon/agent IPC semantics
- event mapping between backend and renderer-facing desktop events
- packaging assumptions in `desktop/packaging`
- release tag and artifact discovery logic
- docs that still imply a single-repo operational model

## Definition of Done

- backend and desktop can be developed and released independently
- both consume the same versioned shared contracts
- packaging no longer relies on monorepo-local assumptions
- docs and tooling reflect explicit ownership boundaries instead of one-root convenience
