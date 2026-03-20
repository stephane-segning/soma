# Shared Contracts

This document defines the contracts between backend and desktop components. These contracts must remain stable across releases to enable independent development and eventual repo split.

## Versioning Policy

- **Current Contract Version**: `v1` (proto packages use `v1` suffix)
- **Compatibility Guarantee**: Breaking changes require a new package version (e.g., `v2`)
- **Deprecation Policy**: Deprecated RPCs must remain functional for at least one major release cycle

## Protocol Buffers (Proto)

### Package Structure

All proto files live in `proto/` at the repository root:

```
proto/
├── daemon/v1/daemon.proto    # Desktop ↔ Daemon IPC (Unix socket)
├── agent/v1/agent.proto      # Desktop ↔ Agent IPC (Unix socket)
└── space/v1/membership.proto  # Shared membership/capability types
```

### Package Namespaces

| Package | Purpose | Consumer |
|---------|---------|----------|
| `daemon.v1` | Daemon IPC API | Desktop (Electron main process) |
| `agent.v1` | Agent IPC API | Desktop (via daemon or direct) |
| `space.v1` | Membership/capability types | Backend + Desktop (shared) |

### Generated Artifacts

#### Rust

- **Crate**: `soma-proto-build` (generated at build time)
- **Location**: `backend/crates/proto-build/`
- **Generation**: Prost + Tonic via `build.rs`
- **Exports**: `daemon::v1`, `agent::v1`, `space::v1`

#### TypeScript

- **Package**: `@soma/proto`
- **Location**: `desktop/desktop-proto/`
- **Generation**: `ts-proto` via `grpc_tools_node_protoc`
- **Exports**: `@soma/proto/daemon/*`, `@soma/proto/agent/*`, `@soma/proto/space/*`

### RPC Service Definitions

#### Daemon Service (`daemon.v1.Daemon`)

Transport: gRPC over Unix domain socket

| RPC | Status | Description |
|-----|--------|-------------|
| `Status` | Stable | Get daemon peer status |
| `JoinSpace` | Stable | Submit join request |
| `StreamEvents` | Stable | Stream daemon events |
| `RevokeSpace` | Stable | Revoke member access |
| `ListSpaceMembers` | Stable | List space members |
| `ListMyMemberships` | Stable | List user's memberships |
| `IssueIssuerCapability` | Unimplemented | Delegate issuer power |
| `DiscoverSpaces` | Unimplemented | Discover spaces via rendezvous |
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

#### Agent Service (`agent.v1.Agent`)

Transport: gRPC over Unix domain socket

| RPC | Status | Description |
|-----|--------|-------------|
| `Status` | Stable | Get agent status and models |
| `ListModels` | Stable | List available models |
| `InlineComplete` | Stable | Inline code completion |
| `Chat` | Stable | Single-turn chat |
| `ChatStream` | Stable | Streaming chat |
| `Embed` | Stable | Generate embeddings |
| `Rerank` | Stable | Rerank candidates by relevance |
| `ResolveDrift` | Stable | Merge Yjs updates |
| `EnqueueBackgroundTask` | Stable | Queue background task |
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

### Socket Paths

Default socket locations (Unix domain sockets):

| Service | Default Path | Stage Override |
|---------|--------------|----------------|
| Daemon | `/tmp/soma-daemon.sock` | `/tmp/soma-daemon-{stage}.sock` |
| Agent | `/tmp/soma-agentd.sock` | `/tmp/soma-agentd-{stage}.sock` |

Environment variable overrides (development only):

- `SOMA_DAEMON_SOCKET`: Override daemon socket path
- `SOMA_AGENTD_SOCKET`: Override agent socket path

### Stage Detection

Stages: `dev`, `staging`, `prod`

Detection order (desktop apps):

1. App name suffix: `{prefix}-{stage}` (e.g., `soma-dev`)
2. Environment: `SOMA_STAGE` or `SOMA_CHANNEL`
3. Build default: `dev` if `isPackaged=false`, else `prod`

Stage effects:

- Non-`prod`: App data redirected to `{appData}/{prefix}-{stage}/`
- Non-`prod`: Sockets suffixed with `-{stage}`

### Service Labels (Packaging)

| Service | Label |
|---------|-------|
| Daemon | `digital.camer.soma.daemon` |
| Agent | `digital.camer.soma.agentd` |

## Release Contracts

### Artifact Naming

#### Daemon/Agent Binaries

```
soma-daemon-{version}-{os}-{arch}.tar.gz
soma-agentd-{version}-{os}-{arch}.tar.gz
```

Examples:

- `soma-daemon-0.1.0-linux-amd64.tar.gz`
- `soma-agentd-0.1.0-macos-arm64.tar.gz`

OS values: `linux`, `macos`

Arch values: `amd64`, `arm64`

#### Desktop Apps

```
soma-desktop-{version}-{os}-{arch}.{ext}
tapia-desktop-{version}-{os}-{arch}.{ext}
```

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
| Daemons | `daemons-v{version}` | `daemons-v0.1.0` |
| Desktop | `desktop-v{version}` | `desktop-v1.0.0` |
| Bundle | `bundle-{label}` | `bundle-20250101-120000` |

### Release Manifest Schema

The packaging CLI outputs a JSON manifest:

```json
{
  "bundle_version": "20250101-120000",
  "daemons_tag": "daemons-v0.1.0",
  "daemons_version": "0.1.0",
  "desktop_tag": "desktop-v1.0.0",
  "desktop_version": "1.0.0",
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

1. **Proto stability**: No breaking changes to existing RPC signatures within `v1`
2. **Socket convention**: Daemon/agent must accept configured socket path via CLI/env
3. **Event compatibility**: New event types must be backward-compatible (unknown types ignored by old clients)

### Desktop → Backend

The desktop must:

1. **Discover sockets**: Use `StageConfigService` to resolve socket paths
2. **Handle unknown events**: Ignore unknown `DaemonEvent` variants without crashing
3. **Support multiple versions**: Be resilient to missing RPCs (check `UNIMPLEMENTED` status)

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
- [ ] Generated TypeScript SDK published to npm or private registry
- [ ] Release manifest schema documented and versioned
- [ ] Socket/runtime conventions documented in a standalone spec
- [ ] Packaging can consume artifacts from separate GitHub releases
- [ ] CI can validate contracts independently in each repo

## Related Documents

- [Local Daemon gRPC](./adrs/0001-local-daemon-grpc.md)
- [Capabilities & Membership](./adrs/0002-capabilities-membership.md)
- [Peer Connectivity](./peer-connectivity.md)