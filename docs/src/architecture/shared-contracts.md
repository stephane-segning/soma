# Shared Contracts

This document defines the contracts between backend and desktop components. These contracts must remain stable across releases to enable independent development and eventual repo split.

Today, the contract source of truth still lives in this monorepo under `proto/`. Plan 08 Phase 2 work in this repo is about making that boundary explicit and portable before any actual extraction happens.

## Versioning Policy

- **Current Contract Version**: `v1` (proto packages use `v1` suffix)
- **Compatibility Guarantee**: Breaking changes require a new package version (e.g., `v2`)
- **Deprecation Policy**: Deprecated RPCs must remain functional for at least one major release cycle

## Protocol Buffers (Proto)

### Package Structure

All proto files live in `proto/` at the repository root:

`proto/README.md` is the lightweight handoff document for this boundary.

```
proto/
├── daemon/v1/daemon.proto    # Record-shape reference for the in-process Tauri host surface
├── agent/v1/agent.proto      # Record-shape reference for the in-process Tauri host surface
└── space/v1/membership.proto  # Shared membership/capability types
```

### Package Namespaces

| Package | Purpose | Consumer |
|---------|---------|----------|
| `daemon.v1` | Record-shape reference for the in-process daemon command surface | Desktop (Tauri host process) |
| `agent.v1` | Record-shape reference for the in-process agent command surface | Desktop (Tauri host process) |
| `space.v1` | Membership/capability types | Backend + Desktop (shared) |

### Generated Artifacts

#### Rust

- **Crate**: `soma-proto-build` (generated at build time)
- **Location**: `backend/crates/proto-build/`
- **Generation**: Prost + Tonic via `build.rs`
- **Exports**: `daemon::v1`, `agent::v1`, `space::v1`
- **Default proto root**: workspace `proto/` resolved from `CARGO_MANIFEST_DIR`
- **Portable override**: `SOMA_PROTO_ROOT=/absolute/path/to/proto cargo build -p soma-proto-build`

#### TypeScript

The renderer no longer consumes the protos directly. The `@soma/proto`
(`desktop/desktop-proto/`) `ts-proto` package was removed with the Electron
app; the Tauri renderer's wire types are emitted from the Rust command graph
instead:

- **Package**: `@soma/sdk` (`desktop/desktop-sdk/`)
- **Generation**: `tauri-specta` walks the `#[tauri::command]` graph and emits
  TypeScript bindings under `desktop/desktop-sdk/src/bindings/`
- **Exports**: the `commands` facade plus the wire types it references

The `proto/` definitions above remain the record-shape reference for the Rust
crates; the desktop side derives its TS types from the host command graph, not
from `ts-proto` codegen.

### Contract Generation Boundary

The current monorepo contract boundary is:

- source definitions stay under `proto/`
- Rust codegen stays under `backend/crates/proto-build`
- the desktop renderer derives its TS wire types from the Tauri command graph
  (`tauri-specta` → `@soma/sdk` bindings), not from a `ts-proto` package
- consumers import generated packages/modules, not raw `.proto` files

That layout is intentionally kept compatible with a future external contracts repository by avoiding new consumer-side assumptions about the monorepo root.

### RPC Service Definitions

#### Daemon Surface (`daemon.v1.Daemon`)

Transport: in-process Tauri commands. The Tauri host links the `soma-daemon`
runtime as a library (via the `desktop-daemon` crate) and exposes it to the
renderer through `#[tauri::command]`s consumed via `@soma/sdk`. The proto
methods listed below are kept as a record-shape reference; they are not
exposed as a gRPC service.

| Method | Status | Description |
|--------|--------|-------------|
| `Status` | Stable | Get daemon peer status |
| `JoinSpace` | Stable | Submit join request |
| `StreamEvents` | Stable | Stream daemon events |
| `RevokeSpace` | Stable | Revoke member access |
| `ListSpaceMembers` | Stable | List space members |
| `ListMyMemberships` | Stable | List user's memberships |
| `IssueIssuerCapability` | Stable backend / desktop-hidden | Owner-gated issuer delegation |
| `DiscoverSpaces` | Stable backend / desktop-hidden | Discover locally known spaces |
| `ListSpaces` | Stable | List managed spaces |
| `CreateSpace` | Stable | Create new space |
| `GetSpace` | Stable | Get space details |
| `UpdateSpace` | Stable | Update space details |
| `DeleteSpace` | Stable | Delete space |
| `ListJoinRequests` | Stable | List pending join requests |
| `DecideJoin` | Stable | Approve/reject join request |
| `UploadBlob` | Stable | Upload blob to store |
| `ReadBlob` | Stable | Read blob by CID |
| `GetBlobMetadata` | Stable | Get blob metadata |
| `ListBlobs` | Stable | List blobs for space |
| `UpsertDocument` | Stable | Create/update document |
| `GetDocument` | Stable | Get document content |
| `EnsurePage` | Stable | Create page if missing |
| `ListPages` | Stable | List pages for space |
| `UpdatePageTitle` | Stable | Update page title |
| `SetPageParents` | Stable | Set page parent IDs |

#### Agent Surface (`agent.v1.Agent`)

Transport: in-process Tauri commands (the host embeds `soma-agentd` via the
`desktop-agent` crate). The agent surface no longer ships as a gRPC service;
the proto file is kept as a record-shape reference only.

| Method | Status | Description |
|--------|--------|-------------|
| `Status` | Stable | Get local helper status |
| `ListModels` | Compatibility | Returns an empty model list (chat / list-models go to the OpenAI-compatible HTTP endpoint instead) |
| `ResolveDrift` | Stable | Merge Yjs updates |
| `InlineComplete` / `Chat` / `ChatStream` / `Embed` / `Rerank` | Removed | The library no longer implements these; the desktop side calls an OpenAI-compatible HTTP endpoint directly |
| `EnqueueBackgroundTask` | Compatibility | Persist a failed background task record |
| `ListBackgroundTasks` | Stable | List background tasks |

### Event Types

#### Daemon Events (`daemon.v1.DaemonEvent`)

Emitted via `StreamEvents` RPC:

| Event | Description |
|-------|-------------|
| `JoinDecisionEvent` | Join decision received (approved/rejected) |
| `JoinSubmitEvent` | Join request submitted to target peer |
| `JoinFailedEvent` | Join request failed |
| `DocumentBlobAddedEvent` | Blob uploaded with document association |

## Runtime Conventions

### Desktop ↔ daemon transport

The daemon and agent runtimes are linked into the Tauri host (`src-tauri`) as
libraries via the `desktop-daemon` / `desktop-agent` crates and run in-process.
The renderer reaches them over Tauri commands (`@soma/sdk`). There is no IPC
socket, no separate daemon process, and no napi addon; the previous
`SOMA_DAEMON_SOCKET` / `SOMA_AGENTD_SOCKET` env vars and the per-stage
socket-path tables are gone.

### Stage Detection

Stages: `dev`, `staging`, `prod`

Detection order (desktop apps):

1. App name suffix: `{prefix}-{stage}` (e.g., `soma-dev`)
2. Environment: `SOMA_STAGE` or `SOMA_CHANNEL`
3. Build default: `dev` if `isPackaged=false`, else `prod`

Stage effects:

- Non-`prod`: App data redirected to `{appData}/{prefix}-{stage}/`

## Release Contracts

### Artifact Naming

#### Server binary (`somad`)

```
somad-{version}-{os}-{arch}.tar.gz
```

Examples:

- `somad-0.1.0-linux-amd64.tar.gz`
- `somad-0.1.0-macos-arm64.tar.gz`

The desktop daemon + agent runtimes are not shipped as standalone binaries —
they're embedded in the Tauri host binary (`src-tauri`) and ride along with the
desktop release.

OS values: `linux`, `macos`

Arch values: `amd64`, `arm64`

#### Desktop Apps

```
soma-desktop-{version}-{os}-{arch}.{ext}
```

The Tapia surface ships inside the Soma desktop artifact (as the `/practice` route); there is no separate `tapia-desktop-*` build.

Extensions:

- Linux: `.AppImage`
- macOS: `.zip`

#### Bundle Packages

```
soma-bundle-{version}-{os}-{arch}.{ext}
```

Extensions:

- Linux: `.deb`, `.rpm`
- macOS: `.pkg`

### Release Tags

| Release Type | Tag Pattern | Example |
|--------------|-------------|---------|
| Server (`somad`) | `server-v{version}` | `server-v0.1.0` |
| Desktop | `desktop-v{version}` | `desktop-v1.0.0` |
| Bundle | `bundle-{label}` | `bundle-20250101-120000` |

### Release Manifest Schema

Release discovery is moving toward explicit JSON manifests. Upstream server
and desktop releases may publish one of these assets on the GitHub Release:

- `server-release-manifest.json`
- `desktop-release-manifest.json`
- `release-manifest.json` (generic fallback name)

The packaging CLI can also consume a manifest directly from a local file path
or URL via `--server-manifest` / `--desktop-manifest`.

#### Upstream release manifest (`soma.release-manifest.v1`)

```json
{
  "schema_version": "soma.release-manifest.v1",
  "release_type": "server",
  "version": "0.1.0",
  "tag": "server-v0.1.0",
  "repo": "digitalcamer/soma-backend",
  "artifacts": [
    {
      "name": "somad-0.1.0-linux-amd64.tar.gz",
      "kind": "somad",
      "os": "linux",
      "arch": "amd64",
      "url": "https://github.com/digitalcamer/soma-backend/releases/download/server-v0.1.0/somad-0.1.0-linux-amd64.tar.gz"
    }
  ]
}
```

Field expectations:

- `schema_version`: current value `soma.release-manifest.v1`
- `release_type`: `server`, `desktop`, or `bundle`
- `version`: semantic version or bundle label for the published release
- `tag`: Git tag backing the release
- `repo`: canonical source repo in `owner/name` form
- `artifacts[]`: explicit artifact records with stable `name`, `url`, `os`, and `arch`
- `artifacts[].kind`: recommended for server/bundle artifacts (`somad`, `deb`, `rpm`, `pkg`, ...)
- `artifacts[].app`: recommended for desktop artifacts (`soma`; Tapia ships inside the Soma artifact and is not a separate `app` value)

#### Bundle output manifest

The packaging CLI also writes a bundle-local manifest next to each platform output (`bundle-release-manifest.json`) so downstream automation can see which upstream releases were bundled without scraping logs:

```json
{
  "bundle_version": "20250101-120000",
  "bundle_repo": "digitalcamer/soma",
  "daemons_tag": "daemons-v0.1.0",
  "daemons_version": "0.1.0",
  "daemons_repo": "digitalcamer/soma-backend",
  "daemons_manifest": "https://example.com/daemons-release-manifest.json",
  "desktop_tag": "desktop-v1.0.0",
  "desktop_version": "1.0.0",
  "desktop_repo": "digitalcamer/soma-desktop",
  "desktop_manifest": "desktop-release-manifest.json",
  "platform_out": "artifacts/bundle/linux-amd64",
  "staging_dir": "artifacts/bundle/linux-amd64/staging",
  "produced": [
    "soma-bundle-20250101-120000-linux-amd64.deb",
    "soma-bundle-20250101-120000-linux-amd64.rpm"
  ],
  "pages_url": "https://owner.github.io/repo/"
}
```

## Compatibility Requirements

### Backend → Desktop

The backend must maintain:

1. **Command surface stability**: No breaking changes to existing `DaemonHandle` / `AgentHandle` method signatures (exposed to the renderer as Tauri commands) within `v1`
2. **Event compatibility**: New event types must be backward-compatible (unknown types ignored by old clients)

### Desktop → Backend

The desktop must:

1. **Link the runtimes**: Embed `soma-daemon` / `soma-agentd` in the Tauri host (`src-tauri`) via the `desktop-daemon` / `desktop-agent` crates
2. **Handle unknown events**: Ignore unknown daemon-event variants without crashing
3. **Support multiple versions**: Be resilient to missing methods on the host command surface

### Version Negotiation

Currently implicit: both sides assume `v1` proto.

Future: Add `Status` response fields for:

- `min_supported_version`
- `current_version`
- `recommended_version`

## Pre-Split Checklist

Before splitting the monorepo, ensure:

- [ ] `proto/` extracted to `soma-contracts` repo
- [ ] Generated Rust SDK published to crates.io or private registry
- [ ] Generated TypeScript SDK published to npm or private registry (the renderer now derives types from the Tauri command graph via `tauri-specta` → `@soma/sdk`)
- [x] Release manifest schema documented and versioned
- [x] `@soma/proto` (`ts-proto`) consumer dependency removed with the Electron app
- [ ] Host command surface documented in a standalone spec
- [x] Packaging can consume artifacts from separate GitHub releases
- [ ] CI can validate contracts independently in each repo

### Groundwork Already Landed In-Monorepo

- `proto/README.md` documents the current contract boundary in-place
- Rust codegen can resolve contracts via `SOMA_PROTO_ROOT`
- The renderer's TS wire types are generated from the Tauri command graph
  (`tauri-specta` → `@soma/sdk` bindings); the proto-driven `ts-proto` pipeline
  was retired with the Electron app

## Related Documents

- [Local Daemon gRPC](./adrs/0001-local-daemon-grpc.md)
- [Capabilities & Membership](./adrs/0002-capabilities-membership.md)
- [Peer Connectivity](./peer-connectivity.md)
