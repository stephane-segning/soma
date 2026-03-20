# Plan 07: Naming Cleanup

**Status:** COMPLETED (Phases 1-4), DEFERRED (Phases 5-6)

Goal: reduce cognitive load by normalizing naming across docs, code, contracts, and tooling.

Scope:

- lingering `Yoopta*` names
- `VDF` vs `VDFS`
- `desktp-*` path/package names
- `server-daemon` wording
- `spaceroom` naming
- `class` vs `space` inconsistency
- Tauri-era helper names still visible in current code

## Why this exists

The repo currently contains multiple historical names from previous implementations and migrations. None of them are fatal individually, but together they create constant uncertainty.

## Naming Buckets

### Bucket A: Safe now (docs/internal names)

These can usually be changed with low compatibility risk:

- docs titles and glossary entries
- `class` vs `space` wording in docs
- Tauri-era helper names in shared UI where not contract-bound
- internal helper/component names that are not serialized or user-facing contracts

### Bucket B: Medium churn, low compatibility risk

These are mostly path/workspace/import cleanups:

- `desktp-*` directory names
- `desktp-icons`

These are not protocol contracts, but they touch many imports/configs and should be done atomically.

### Bucket C: Contract-bound, compatibility-sensitive

These require explicit migration strategy:

- `YooptaBlobAddedEvent`
- `yoopta_blob_added`
- `spaceroom.v1`
- `SOMA_MODE=server-daemon`
- `soma-vdfs` / `soma_vdfs`
- `soma-serverd`

## Recommended Target Names

### Yoopta residue

- `YooptaBlobAddedEvent` -> `DocumentBlobAddedEvent`
- `yoopta_blob_added` -> `document_blob_added`
- `yoopta-blob-added` -> `document-blob-added`
- `daemon_yoopta_blob_added` -> `daemon_document_blob_added`

### VDF/VDFS

Recommended public/docs term:

- `cache peer`

If the acronym is retained internally, standardize on:

- `VDF`

Longer-term rename targets:

- `soma-vdfs` -> `soma-blobs`
- `blobs-vdfs.md` -> `blobs.md` or `blobs-cache-peers.md`

### `desktp-*`

Recommended path names:

- `desktop/desktop-proto`
- `desktop/desktop-config`
- `desktop/desktop-data`
- `desktop/desktop-editor`
- `desktop/desktop-ui`
- `desktop/desktop-icons`

### `server-daemon`

Recommended mode name:

- `admin`

Recommended docs phrase:

- `admin HTTP mode`
- `admin control plane`

### `soma-serverd`

If kept, rename target should reflect its real role better. Example:

- `soma-infrad`

If not kept, deprecate it and steer users to the individual binaries.

### `spaceroom`

Recommended target:

- `space.v1`

## Phase Plan

### Phase 1: Naming Policy

Write down the canonical terminology for:

- `space`
- `document`
- `cache peer`
- `admin mode`

Acceptance criteria:

- new docs and code stop introducing fresh drift

### Phase 2: Docs-first cleanup

Update current docs, README, and AGENTS guidance to use canonical terms.

Safe targets:

- class/space wording
- VDF explanation cleanup
- Tauri history labeling
- docs titles like `Class Membership`

Acceptance criteria:

- visible docs reflect the chosen naming policy

### Phase 3: Internal helper cleanup

Rename non-contract leftovers:

- `use-tauri-store`
- `data-tauri-drag-region`
- similar internal helper or component names

Acceptance criteria:

- current code stops leaking historical framework names where they are no longer meaningful

### Phase 4: Workspace/path cleanup

Atomically rename the `desktp-*` directories and all dependent references.

Acceptance criteria:

- workspace manifests, imports, build config, docs, and tooling all use the corrected paths

### Phase 5: Compatibility-backed contract renames

Add new names before removing old ones:

- `DocumentBlobAddedEvent` alongside Yoopta names
- `admin` mode while still accepting `server-daemon`
- new crate or binary names with temporary shims/aliases

Acceptance criteria:

- no breaking rename occurs without a compatibility window

### Phase 6: Deep contract migration

After the compatibility window:

- rename `proto/spaceroom/v1/membership.proto`
- remove deprecated Yoopta names
- remove deprecated `server-daemon` naming
- finish VDFS -> blob/cache-peer naming cleanup

## Suggested Execution Order

1. naming policy
2. docs cleanup
3. internal helper rename
4. `desktp-*` path cleanup
5. contract aliases/migration layer
6. hard contract rename cleanup

## Definition of Done

- [x] docs and code use one canonical terminology set
- [ ] historical names are either gone or explicitly compatibility-bound (Phases 5-6 deferred)
- [x] new contributors do not need historical context to understand basic naming

## Completed Work

### Phase 1: Naming Policy
- Created `docs/src/naming-policy.md` defining canonical terminology
- Documented: space, document, cache peer, admin mode

### Phase 2: Docs Cleanup
- Renamed `architecture/class-membership.md` → `architecture/space-membership.md`
- Updated all docs to use "space" instead of "class"
- Updated ADR-0002 and ADR-0003 to use space terminology
- Updated glossary, overview, e2e-flows, and other key docs

### Phase 3: Internal Helper Cleanup
- Removed unused `use-tauri-store.ts` hook
- Removed unused `@tauri-apps/*` dependencies from desktp-ui
- Fixed `data-tauri-drag-region` → `data-drag-region` in window-chrome.tsx

### Phase 4: Workspace/Path Cleanup
- Renamed all `desktp-*` directories to `desktop-*`:
  - `desktop-proto`, `desktop-config`, `desktop-data`, `desktop-editor`, `desktop-ui`, `desktop-icons`
- Updated `pnpm-workspace.yaml`
- Updated all tsconfig and storybook configs
- Updated AGENTS.md and README.md

### Phases 5-6: Deferred
These phases involve contract-level changes (proto renames, event renames, admin mode aliasing) and should be done as a separate migration with compatibility windows.
