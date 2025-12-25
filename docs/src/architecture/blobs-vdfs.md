# Blobs (VDF): Content‑Addressed Storage + Fetch‑by‑CID

This doc describes Soma’s minimal “VDF” layer: **blob content‑addressed storage (CAS)** plus a **pull‑based fetch‑by‑CID** protocol over libp2p.

It intentionally does **not** cover any virtual filesystem mapping (paths, directories, versioned mounts, etc.).

Terminology note:

- In repo discussions, a **VDF** is the **cache-only peer role** (most commonly `soma-botd`).
- In code, the crate is currently named `soma-vdfs` for historical reasons.

## Goals

- Store binary assets (“blobs”: images, videos, files, editor attachments) **out of band** from collaborative document state.
- Address blobs by a stable **CID computed from bytes** (content address).
- Allow peers to **fetch a blob by CID** from any reachable peer that has it (daemon store or bot cache).
- Keep the networking surface **pull‑based** (no “push bytes to bot” protocol).

## Non‑goals

- Virtual filesystem mapping / path semantics.
- HTTP upload endpoints for bots (`soma-botd` stays cache‑only).
- Large file streaming/chunking (today: single request/response message, size‑bounded).

## Concepts

- **Blob**: raw bytes + lightweight metadata (mime, name, size).
- **CID**: identity of a blob, computed from the blob’s bytes (today: SHA‑256 hex string).
- **Space scope**: blobs are stored under a `space_id` directory for layout and operational scoping.
- **Daemon store vs bot cache**:
  - `soma-daemon` is the source of truth for user‑created blobs (local IPC upload).
  - `soma-botd` is cache‑only for blobs (writes only as a side‑effect of fetching by CID).

## CID format (today)

- Algorithm: **SHA‑256**
- Encoding: **lowercase hex**
- Size: 64 chars (32 bytes)

Implementations:

- Shared filesystem store: `soma_vdfs::fs::FsBlobStore` (`backend/crates/vdfs/src/fs.rs`)
  - Used by both `soma-daemon` (authoritative store) and `soma-botd` (cache-only by policy, populated via fetch).

Note: this is “CID” in the generic sense; it is not currently a multihash/CIDv1 string.

## Storage layout (filesystem)

Both daemon and bot use the same layout:

`<blob_root>/<space_id>/<cid>`

Examples:

- Daemon blob root: configured by `--blob-dir` / `SOMA_BLOB_DIR` (see `backend/bins/daemon/src/config.rs`)
- Bot blob root: configured by `--blob-dir` / `SOMA_BLOB_DIR` (see `backend/bins/botd/src/config.rs`)

## Local ingestion (desktop)

Desktop UX stages blobs locally and only uploads them to the daemon when the document is synced/published:

- Renderer stages blobs via `window.api.blobs.stage(...)` (`desktop/soma/src/renderer/src/lib/blob.ts`)
- Main process persists staged bytes under `soma-blob://local/<blobId>` (`desktop/soma/src/main/services/documents-service.ts`)
- On publish/sync, staged blobs are migrated to daemon CAS via `Daemon/UploadBlob` and a local “blob id → cid” mapping is recorded (`desktop/soma/src/main/services/main-ipc-controller.ts`)

Daemon API:

- gRPC: `Daemon/UploadBlob` (`proto/daemon/v1/daemon.proto`, implemented in `backend/bins/daemon/src/grpc.rs`)
- Size limit: `MAX_UPLOAD_BYTES = 8 MiB` (`backend/bins/daemon/src/grpc.rs`)

## Network fetch protocol (libp2p)

### Protocol id

- `/soma/blob/1` (see `BLOB_PROTOCOL` in `backend/crates/peer/src/lib.rs`)

### Transport

- libp2p request/response behaviour (`libp2p::request_response`)
- Request timeout: 30s (`backend/crates/peer/src/lib.rs`)

### Messages

Defined as `prost` messages in `backend/crates/peer/src/lib.rs`:

- `BlobRequest { cid: string, space_id: string }`
- `BlobResponse { cid, mime, size, data, found, space_id }`

Framing and limits:

- Messages are encoded with `prost` and framed with a 4‑byte big‑endian length prefix.
- `MAX_BLOB_MESSAGE_BYTES = 8 MiB` bounds any single blob request/response message.

This means blobs are currently limited to “small attachment” sizes; large file support will require chunking/streaming.

## Provider boundary (`BlobProvider`)

`soma-peer` treats “blob storage” as a dependency injected into the peer runtime:

- Trait: `soma_vdfs::BlobProvider` (`backend/crates/vdfs/src/lib.rs`)
  - `get(cid, space_id) -> Option<BlobResponse>`
  - `put(expected_cid, space_id, bytes, mime) -> SomaResult<bool>` (implementations verify CID before writing)

Implementations:

- `soma-daemon` and `soma-botd`: `soma_vdfs::fs::FsBlobStore` (`backend/crates/vdfs/src/fs.rs`)

Operational note: current filesystem implementations require a non‑empty `space_id` and will refuse to read/write if it is missing.

## Fetch flow (conceptual)

```mermaid
sequenceDiagram
  autonumber
  participant UI as Desktop UI
  participant D as soma-daemon (peer + blob store)
  participant P as soma-peer runtime (libp2p)
  participant R as Remote peer (daemon or bot)
  participant S as Remote BlobProvider (store/cache)

  UI->>D: request blob by CID (future UI API)
  D->>P: PeerCommand::FetchBlob(target, cid, space_id)
  P->>R: /soma/blob/1 BlobRequest(cid, space_id)
  R->>S: BlobProvider.get(cid, space_id)
  S-->>R: bytes (or miss)
  R-->>P: BlobResponse(found=true|false, data=bytes)
  P->>D: BlobProvider.put(expected_cid, space_id, bytes)
```

Today, the peer runtime already supports `/soma/blob/1` and `PeerCommand::FetchBlob`; wiring a higher-level “request blob” API for the desktop/UI is a separate step.

## Security and limits

- Always enforce a maximum blob size at ingress (daemon IPC) and egress (network transfer). Current limit is 8 MiB on both paths.
- Always verify bytes match the CID before persisting or serving (both current FS implementations do this on `put`).
- Treat remote blobs as untrusted: do not automatically execute or render without appropriate UI sandboxing.
- Authorization is currently minimal; future work should gate downloads using membership/permissions (see `SPACE_PERMISSION_DOWNLOAD_BLOBS` in `proto/spaceroom/v1/membership.proto`).

## Implementation note: shared FS backend

The daemon and bot now share a single filesystem backend in `soma-vdfs`:

- `soma_vdfs::fs::FsBlobStore` (`backend/crates/vdfs/src/fs.rs`)

Policy-level differences (“authoritative store” vs “cache-only”) are enforced by which code paths are exposed to users (daemon IPC upload vs network pull-by-CID) rather than by separate storage implementations today.
