# TanStack React DB Migration (Soma + Tapia)

Goal: introduce `@tanstack/react-db` as the single, consistent frontend persistence layer for Soma + Tapia, backed by `electron-store`, and use it to drive (and, where needed, forward) specific projections to `soma-daemon`.

This document is intentionally architecture-first: it defines ownership boundaries, collections, and the order of changes so we don't accumulate a half-migrated persistence mess.

## Non-Goals (for this phase)

- Do not make React DB the source of truth for spaces/pages/documents/blobs. Canonical content remains daemon-owned.
- Do not replace Yjs. Yjs remains the conflict-resolution mechanism for collaborative document/page state.
- Do not add new HTTP services. Keep desktop surfaces renderer <-> Electron main <-> daemon IPC as-is.

## Current State (baseline)

Soma has multiple persistence patterns:

- Main process `electron-store` wrapper: `desktop/soma/src/main/services/app-data-store.ts` (stores `settings` + `windowState`).
- Renderer UI state persisted through main-process "settings" IPC:
  - Renderer: `desktop/soma/src/renderer/src/services/settings-service.ts`
  - IPC registry: `desktop/soma/src/main/command-registry.ts` (`settings_get/settings_set`)
  - Main controller: `desktop/soma/src/main/controllers/settings-controller.ts`
  - Tabs persistence wired via settings: `desktop/soma/src/renderer/src/routes/tabbed-app.tsx`
- Renderer `localStorage`:
  - Mailbox: `desktop/soma/src/renderer/src/lib/document-mailbox.ts`
  - i18n cache (language): `desktop/soma/src/renderer/src/lib/i18n.ts`

Tapia:

- No `electron-store` persistence layer.
- Typed preload API (`window.api`) with ad-hoc IPC handlers: `desktop/tapia/src/preload/index.ts`, `desktop/tapia/src/main/index.ts`.
- i18n uses `localStorage`: `desktop/tapia/src/renderer/src/lib/i18n.ts`.

Net: persistence is fragmented (electron-store settings, localStorage, in-memory-only), and Soma/Tapia are not aligned.

## Ownership Boundaries (must be explicit)

We classify state into three buckets:

1) Frontend-owned (persist locally; daemon is not authoritative)
- Pure UX continuity.

2) Daemon-owned (frontend caches/derives only; daemon is authoritative)
- Spaces, memberships, pages/documents, blobs.

3) Frontend outbox -> daemon (frontend authors intent; daemon executes/persists)
- Upload jobs, explicit "sync/projection" signals.

Rule: if the daemon already has a canonical store for it, React DB is only allowed to keep a cache/projection or UI metadata; never the truth.

## Collections (initial set)

All records should include:

- `updatedAtMs: number` (LWW merge key)
- `version: number` (record schema version, for safe migrations)

### Frontend-owned collections (persist; LWW merge)

- `tabs`
  - open tabs, per-tab title, per-tab current route/path
  - Soma already persists this via settings; move to DB first.

- `routing`
  - active tab id, last route per space, deep-link restore hints
  - (Soma: helps restore `#/...` initial route; Tapia: active space + last screen)

- `uiPreferences`
  - language, theme knobs, editor preferences, feature flags, onboarding state
  - replaces i18n `localStorage` cache usage.

- `draftMailbox`
  - replaces `desktop/soma/src/renderer/src/lib/document-mailbox.ts` localStorage usage
  - "draft-y" per-(spaceId,pageId) state that is safe to drop if needed.

- `recent`
  - recent spaces/pages/documents, recent searches/commands

- `dismissedNotices`
  - one-off tips/toasts/tutorial cards that should not reappear.

### Frontend outbox collections (persist; drives daemon side-effects)

- `uploadJobs`
  - tracks staged uploads, progress, retries, mapping to resulting `{spaceId,cid,url}`
  - soma already stages via `blobs_stage` -> daemon upload (`DaemonClient.uploadBlob`); DB should track intent + outcome.

- `daemonSyncQueue`
  - generic job queue for "forward this projection to daemon"
  - this is the hook point to gradually add daemon-side consumption without coupling components to daemon calls.

### Daemon-owned caches/projections (optional; do not treat as truth)

- `spacesView`
  - UI metadata: pinned/order, lastOpenedAt, per-user sorting.

- `pagesView`
  - UI metadata: pinned pages, expanded/collapsed tree state, local ordering.

### Tapia-specific (optional, but likely valuable)

- `practiceSessions`
  - Tapia currently stores sessions/leaderboard in-memory in `desktop/tapia/src/main/index.ts`.
  - If we want persistence across restarts, store sessions locally (frontend) or in main (depending on security needs).

## Conflict Resolution Policy (LWW)

For frontend-owned + outbox collections:

- Last writer wins: prefer the record with higher `updatedAtMs`.
- If `updatedAtMs` ties, break by deterministic tiebreaker (e.g. `clientId` lexicographic) to avoid flapping.

Notes:

- This is only for frontend state. Collaborative document conflicts remain Yjs-based.
- If we eventually sync some projections between devices, we should add:
  - `deviceId` (stable per install)
  - `opId` or monotonic `seq` to harden ordering.

## Electron Store Backing (where persistence actually lives)

We should persist the React DB state via Electron main, not via renderer localStorage/IndexedDB.

Why:

- Single consistent location per app profile (`electron-store`).
- Renderer is sandboxed-ish and should not own filesystem paths.
- Enables future encryption / key rotation if needed.

### Storage shape options

We need to pick one:

Option A: single "db snapshot" key
- Key: `reactDb.snapshot`
- Value: serialized state for all collections.
- Pros: simple IPC surface, atomic-ish.
- Cons: bigger writes; needs throttling.

Option B: per-collection keys
- Keys: `reactDb.collections.<name>`
- Pros: smaller writes, easier partial migration.
- Cons: more IPC endpoints or more complex payloads.

Recommendation: start with Option B (per-collection) to migrate incrementally without forcing a full schema at once.

## IPC Contract (renderer <-> main)

We need a small, versioned storage API. Keep it generic; do not leak business logic into it.

Suggested IPC commands (per app):

- `db_get_collection`
  - args: `{ name: string }`
  - returns: `{ version: number, data: unknown } | null`

- `db_set_collection`
  - args: `{ name: string, value: { version: number, data: unknown } }`
  - returns: `{ ok: true }`

Optional:
- `db_list_collections` (debug)
- `db_clear` (dev-only, guarded)

Soma implementation lives in:

- IPC registry: `desktop/soma/src/main/command-registry.ts`
- Storage: extend `desktop/soma/src/main/services/app-data-store.ts` to include a `reactDb` namespace.

Tapia implementation should mirror Soma (either by copying the pattern or creating a small shared helper).

## Renderer Integration (React DB wiring)

Each app should:

- Create a single DB instance at renderer startup.
- Provide it via a top-level provider (near the existing `Provider store={store}` in Soma).
- Install a persistence adapter that reads/writes via the IPC contract above.
- Throttle writes (e.g. 250ms idle debounce) and flush on `beforeunload`.

Keep existing Redux/RTK Query (Soma) for now.

- Redux remains great for ephemeral view state and existing flows.
- We migrate slice-by-slice into DB rather than big-bang swapping state management.

## Migration Order (designed to reduce risk)

1) Create a shared package for schemas + merge rules
- Add a new workspace package (e.g. `desktop/desktp-data` or `desktop/desktp-db`)
- Owns:
  - collection types + versioned schemas
  - LWW merge helpers (pure functions)
  - DB bootstrap helpers (no Electron imports; renderer-only)

2) Implement Electron main persistence API (Soma first)
- Extend `AppDataStore` with `reactDb` read/write helpers.
- Add the `db_get_collection/db_set_collection` IPC commands.

3) Implement Electron main persistence API (Tapia)
- Add an `AppDataStore` equivalent and the same IPC endpoints.
- Consider aligning Tapia main to a "registry + controllers" structure like Soma for long-term maintainability.

4) Wire React DB provider in Soma renderer
- Hook into `desktop/soma/src/renderer/src/main.tsx`.

5) Migrate Soma tabs (first real collection)
- Replace settings-based persistence in `desktop/soma/src/renderer/src/routes/tabbed-app.tsx`.
- Keep the Redux slice for runtime logic if desired, but persist/read state from DB instead of `settings_get/settings_set`.

6) Migrate Soma mailbox + i18n persistence
- Replace `localStorage` mailbox with `draftMailbox`.
- Replace i18n localStorage cache with `uiPreferences.language`.

7) Wire React DB provider in Tapia renderer
- Hook into `desktop/tapia/src/renderer/src/main.tsx`.

8) Migrate Tapia routing + selected space
- Move `DEFAULT_SPACE_ID` selection + `useParams` defaulting logic into a persisted `routing` record so the app restores consistently.

9) Introduce `uploadJobs` + `daemonSyncQueue`
- Start by tracking upload intent/outcome locally in Soma.
- Add a single "outbox worker" service that:
  - watches the outbox collections
  - calls existing IPC commands (`blobs_stage`, `documents_queue_daemon_sync`, etc.)
  - marks jobs done/failed with retries.

## Forwarding to `soma-daemon` (projection pipeline)

We should not "forward arbitrary collections to daemon" directly from components.

Instead:

- Define a small set of projections that daemon cares about (if any), with explicit versioned payloads.
- Use an outbox worker to push them when stable (debounced/batched).

Candidates to forward (future, not required for initial migration):

- `tabs` projection (maybe): allows daemon to provide "restore session" if we ever need to coordinate across UI windows.
- `uploadJobs` results: mostly UI-only; daemon already has blobs metadata; probably no forward needed beyond existing upload RPC.

Likely "do not forward":

- `routing`, `uiPreferences`, `recent`, `dismissedNotices` (pure frontend UX).

## Open Questions (need decisions before implementation)

- Storage shape: single snapshot vs per-collection keys (recommend per-collection).
- Do we want Tapia to keep using typed preload API only, or also expose a generic `invoke(channel,args)` like Soma?
- Do we want the DB schema package to live under:
  - `desktop/desktp-db` (new), or
  - `desktop/desktp-ui` (not ideal; UI package is shared components), or
  - per-app (least ideal; duplication).
- Any security requirements for stored data (encryption, PII constraints)?

