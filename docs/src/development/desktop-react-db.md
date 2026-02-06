# Desktop React DB vs `soma-daemon`: What Lives Where

This doc is a mental model for Soma/Tapia desktop persistence when using `@tanstack/react-db` backed by `electron-store`, and how (and when) data flows to `soma-daemon`.

## The 4 Local Layers (same laptop, different responsibilities)

Even on one machine, Soma is multiple processes with different trust + durability boundaries:

1. Renderer (UI) state
   - React components + `@tanstack/react-db` collections
   - This is UX continuity and workflow state.
2. Electron main persistence
   - `electron-store` (filesystem-backed) owned by the Electron main process
   - In Soma/Tapia we expose a small IPC storage bridge (`db_storage_*`) so renderer collections can persist.
3. `soma-daemon` persistence
   - SQLite + blob pool on disk (daemon-owned)
   - Canonical domain state that can participate in peer sync (libp2p) lives here.
4. Network peers (optional for "local")
   - Other devices/peers, bots, and VDF caches
   - Not required for single-laptop usage, but it is why daemon-owned data must remain canonical.

## Table: What Goes Where (and why)

| Data / Collection | Example records | Source of truth | Where it is stored on disk | Should it be forwarded to `soma-daemon`? | Why |
|---|---|---|---|---|---|
| Tabs/session UI | `tabs` (open tabs, title, per-tab path) | Renderer | Electron main `electron-store` via React DB storage bridge | No (usually) | Pure UX continuity; daemon doesn't need it to sync spaces. |
| Routing / restore | `routing` (active tab, last route per space) | Renderer | Electron main `electron-store` | No | UX only. |
| UI preferences | `uiPreferences` (language, toggles) | Renderer | Electron main `electron-store` | No | UX only; safe to keep local. |
| Draft mailbox (safety net) | `draftMailbox` (page draft snippet + `updatedAtMs`) | Renderer | Electron main `electron-store` | Optional (as *a sync trigger*, not as a second canonical copy) | Used to recover UI drafts between reloads/crashes; daemon remains canonical for documents. |
| Upload jobs/outbox | `uploadJobs` (queued uploads, progress, retries) | Renderer | Electron main `electron-store` | Yes (as operations: `UploadBlob`, etc.) | Renderer tracks workflow; daemon persists verified bytes + metadata. |
| Space list (canonical) | spaces, memberships | Daemon | `soma-daemon` SQLite | N/A (daemon owns) | Domain state and security boundaries belong in daemon. |
| Documents/pages (canonical content) | Yoopta/Yjs document/page state | Daemon | `soma-daemon` SQLite | N/A (daemon owns) | Must be durable + syncable; conflicts resolved via Yjs, not LWW. |
| Page tree metadata (canonical) | `pages` table (title, parents) | Daemon | `soma-daemon` SQLite | N/A (daemon owns) | Used to render navigation and sync across peers. |
| Blobs (canonical bytes) | `{spaceId,cid}` addressed bytes | Daemon | daemon blob pool + metadata in SQLite | N/A (daemon owns) | Must verify CID and enforce limits; UI never reads raw files directly. |
| “View” metadata | `spacesView`, `pagesView` (pinned/order/expanded) | Renderer | Electron main `electron-store` | No | UX-only projections over daemon-owned data. |

### “Duplication” on one laptop: what’s acceptable?

Acceptable duplication:
- UX caches and safety nets (tabs/routing/preferences/mailbox)
- Outbox job state (upload progress, retry metadata)

Avoided duplication:
- Full canonical document/page content in renderer DB
- Canonical space/membership state in renderer DB
- Blob bytes in renderer DB

If we store a draft locally (mailbox), it should be small, have a TTL/eviction policy, and be cleared when daemon persistence is confirmed.

## Diagram: How Data Moves

### A) Pure local UX state (tabs/preferences)

```text
Renderer (React)                        Preload bridge              Electron main                 Disk
----------------                        -------------              ------------                 ----
@tanstack/react-db collection  --->  window.api.dbStorage.*  --->  electron-store (reactDb map)  config file
 (tabs/uiPreferences/etc)             (db_storage_* IPC)          (per-collection keys)
```

Key point: UX state never leaves the laptop and does not touch `soma-daemon`.

### B) Domain state write (documents/pages)

```text
Renderer (React)                 Electron main (controllers)             soma-daemon (gRPC over UDS)             Disk
----------------                 --------------------------             ----------------------------             ----
user edit page                -> documents_* IPC command             -> Daemon/UpsertDocument RPC             -> SQLite (documents)
UI triggers save/sync            DocumentsController/DaemonClient        (canonical doc state)                    (canonical)

Conflict resolution for content: Yjs (daemon-side / peer-side), NOT LWW.
```

Key point: renderer does not own canonical document state; it only sends operations/updates to daemon.

### C) Blob upload (bytes + CID)

```text
Renderer (React)                 Electron main                         soma-daemon                               Disk
----------------                 -------------                         ---------                                ----
select file bytes            -> blobs_stage IPC                    -> Daemon/UploadBlob RPC                 -> blob pool (bytes)
track job in uploadJobs         BlobsController/DaemonClient          verify/record metadata                   + SQLite (blobs/meta)
```

Key point: renderer may track workflow/progress, but daemon verifies CID and is the only writer of blob bytes.

### D) Blob read (for rendering)

```text
Renderer <img src="soma-blob://daemon/{space}/{cid}">
     |
     v
Electron protocol handler (main): desktop/soma/src/main/services/blob-protocol.ts
     |
     v
soma-daemon: Daemon/ReadBlob (gRPC over UDS) -> bytes
```

Key point: UI never reads blob files directly from disk.

## What Happens When Changes Come From `soma-daemon`?

This is the important part for "a page a user doesn't own" (i.e. changes the UI did not author).

### Principle: Do Not Merge Daemon-Owned State Into React DB

- Daemon-owned data (spaces, memberships, documents/pages, blobs) is canonical in `soma-daemon`.
- React DB is for:
  - UX continuity (tabs/routing/preferences)
  - local safety nets (draft mailbox)
  - workflow state (outbox/jobs like uploads)
- So when `soma-daemon` changes, the renderer should **refetch/invalidate** the daemon-backed data, not "merge" it into React DB.

If we replicated documents/pages into React DB we would:
- duplicate canonical data on disk
- risk applying the wrong conflict resolution strategy (LWW) to collaborative content (should be Yjs)
- make it unclear which process is authoritative

### Flow 1: Pull (Renderer Refetches Daemon State)

This is what we do by default today:

- Renderer calls IPC methods implemented in Electron main (which calls the daemon gRPC client).
- RTK Query caches responses and provides a "reactive enough" UI (but updates require invalidation/refetch).

Typical triggers:
- user navigates to a space/page
- window focus / "app resumed"
- periodic refresh for lists (spaces/pages) if we want

### Flow 2 (Recommended): Push (Daemon -> Main -> Renderer Notifications)

For fast updates (especially when remote peers update pages), we should add a lightweight notification channel:

1. `soma-daemon` receives a remote update (libp2p) and persists it (SQLite/Yjs).
2. Electron main receives a "domain changed" signal.
3. Electron main forwards a typed event to the renderer via IPC.
4. Renderer invalidates RTK Query tags (or refetches specific queries).

```text
Remote peer(s)          soma-daemon                 Electron main                    Renderer
-------------          ----------                 -------------                    --------
libp2p updates   -->  persist canonical state  ->  domain_event IPC push      -->  invalidate/refetch
                     (SQLite/Yjs/blob pool)        (small payload)                  (RTK Query)
```

Important: this "push" channel is **notifications only**, not state replication. The renderer still reads canonical state via the daemon-backed queries.

### Example: "A Page The User Doesn't Own"

There are two separate concerns here: authorization and conflict resolution.

Authorization:
- Ownership/roles/capabilities are daemon-owned and enforced by `soma-daemon`.
- If the local user is a viewer (or otherwise not allowed to write), the renderer should render read-only UI, and any "write" operations should be rejected by daemon.

Conflict resolution:
- Collaborative document/page content must be merged using **Yjs**, and that happens in the daemon/peer layer.
- Renderer LWW (`updatedAtMs`) is not used for document conflict resolution.

So, when another peer updates a page:

1. `soma-daemon` receives the update and merges/persists it (Yjs + SQLite).
2. Renderer learns "something changed" (via pull refetch, or via push event).
3. Renderer re-queries the daemon for the latest page/document content and renders it.

What about local drafts (mailbox)?

- Mailbox is a local *safety net* for crashes/reloads; it is not canonical.
- If a mailbox entry exists for a page that just changed remotely, the UI should treat it as a potential divergence:
  - If mailbox is older than daemon content: mark mailbox as stale and offer "discard" (or auto-clear).
  - If mailbox is newer than daemon content: offer a "restore draft" action (which creates a new local edit intent).

Recommended improvement (for better UX and fewer false conflicts):
- Store an additional field in the mailbox record such as:
  - `baseDaemonUpdatedAtMs` (or a Yjs state vector hash)
so we can detect "draft is based on an older revision" precisely.

### Where LWW Applies (and where it must not)

- LWW (`updatedAtMs`) is for frontend collections only:
  - tabs, routing, preferences, outbox jobs
- LWW must not be used as the primary merge strategy for:
  - Yoopta/Yjs document content
  - capabilities/memberships
  - blob bytes (CID verification rules)

## Rule of Thumb

- If it is UX continuity: keep it in React DB (electron-store).
- If it affects sync/security/network: it belongs in `soma-daemon`.
- If it is a workflow (uploads, retries): keep job state in React DB and forward *operations* to daemon.
