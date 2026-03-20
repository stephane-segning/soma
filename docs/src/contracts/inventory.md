# Backend/Desktop Contract Inventory

This document tracks the shared contract surface between backend (Rust gRPC) and desktop (Electron main-process wrappers).

**Last Updated:** 2026-03-20

## Status Legend

| Status | Meaning |
|--------|---------|
| `implemented` | Declared in proto, implemented in backend, exposed in desktop |
| `unimplemented` | Declared in proto, returns `UNIMPLEMENTED` in backend |
| `declared-only` | Declared in proto but no backend server exists |
| `desktop-hidden` | Implemented in backend but not exposed via desktop wrapper |
| `transitional` | Implemented but semantics are unstable/ambiguous |

---

## daemon.v1.Daemon (Unix socket IPC)

| RPC | Proto | Backend | Desktop | Docs | Status | Notes |
|-----|-------|---------|---------|------|--------|-------|
| `Status` | ✅ | ✅ | ✅ | ❌ | `implemented` | Returns peer_id + listen_addrs |
| `JoinSpace` | ✅ | ✅ | ✅ | ❌ | `transitional` | Returns submission state, not approval; emits `joinSubmitted` event |
| `StreamEvents` | ✅ | ✅ | ✅ | ❌ | `transitional` | Can duplicate `joinSubmitted` on reconnect; no replay semantics documented |
| `RevokeSpace` | ✅ | ✅ | ✅ | ❌ | `implemented` | Deletes local membership; clears local cache if self-revocation |
| `ListSpaceMembers` | ✅ | ✅ | ✅ | ❌ | `implemented` | Lists membership rows for a space |
| `ListMyMemberships` | ✅ | ✅ | ✅ | ❌ | `implemented` | Lists memberships where subject = self |
| `IssueIssuerCapability` | ✅ | ✅ | ❌ | ❌ | `unimplemented` | Backend returns `UNIMPLEMENTED`; declared but not implemented |
| `DiscoverSpaces` | ✅ | ✅ | ❌ | ❌ | `unimplemented` | Backend returns `UNIMPLEMENTED`; declared but not implemented |
| `ListSpaces` | ✅ | ✅ | ✅ | ❌ | `implemented` | Paginated space list with optional query filter |
| `CreateSpace` | ✅ | ✅ | ✅ | ❌ | `implemented` | Creates space record; owner defaults to self |
| `GetSpace` | ✅ | ✅ | ✅ | ❌ | `implemented` | Fetch single space by ID |
| `UpdateSpace` | ✅ | ✅ | ✅ | ❌ | `implemented` | Update display_name |
| `DeleteSpace` | ✅ | ✅ | ✅ | ❌ | `implemented` | Hard delete space record |
| `ListJoinRequests` | ✅ | ✅ | ✅ | ❌ | `transitional` | Lists pending incoming join requests; semantics broader than name suggests |
| `DecideJoin` | ✅ | ✅ | ✅ | ❌ | `transitional` | Approve/reject; signs capability on approve; pushes decision via mailbox if offline |
| `UploadBlob` | ✅ | ✅ | ✅ | ❌ | `implemented` | Content-addressed blob storage; emits `YooptaBlobAdded` if doc_id provided |
| `ReadBlob` | ✅ | ✅ | ✅ | ❌ | `transitional` | `mime` field hardcoded to `application/octet-stream` (ignores stored MIME) |
| `GetBlobMetadata` | ✅ | ✅ | ❌ | ❌ | `desktop-hidden` | Implemented in backend; not exposed in daemon-client.ts |
| `ListBlobs` | ✅ | ✅ | ❌ | ❌ | `desktop-hidden` | Implemented in backend; not exposed in daemon-client.ts |
| `UpsertDocument` | ✅ | ✅ | ✅ | ❌ | `implemented` | Stores Yoopta JSON draft |
| `GetDocument` | ✅ | ✅ | ✅ | ❌ | `implemented` | Fetch Yoopta JSON draft |
| `EnsurePage` | ✅ | ✅ | ✅ | ❌ | `implemented` | Create page record if not exists |
| `ListPages` | ✅ | ✅ | ✅ | ❌ | `implemented` | List page records for space |
| `UpdatePageTitle` | ✅ | ✅ | ✅ | ❌ | `implemented` | Update page title |
| `SetPageParents` | ✅ | ✅ | ✅ | ❌ | `implemented` | Set page parent hierarchy |

### Daemon Events (StreamEvents)

| Event | Proto | Backend Emits | Desktop Maps | Status | Notes |
|-------|-------|---------------|--------------|--------|-------|
| `JoinDecisionEvent` | ✅ | ✅ | ✅ | `implemented` | Received join decision from peer |
| `JoinSubmitEvent` | ✅ | ✅ | ✅ | `transitional` | Emitted on join submission; can duplicate |
| `JoinFailedEvent` | ✅ | ✅ | ✅ | `implemented` | Outbound join request failed |
| `YooptaBlobAddedEvent` | ✅ | ✅ | ✅ | `implemented` | Legacy: blob uploaded with doc_id association |
| `DocumentBlobAddedEvent` | ✅ | ✅ | ✅ | `implemented` | Preferred: alias for YooptaBlobAddedEvent |

---

## agent.v1.Agent (Unix socket IPC)

| RPC | Proto | Backend | Desktop | Docs | Status | Notes |
|-----|-------|---------|---------|------|--------|-------|
| `Status` | ✅ | ✅ | ✅ | ❌ | `implemented` | Returns version, default models, model list |
| `ListModels` | ✅ | ✅ | ✅ | ❌ | `implemented` | Enumerate available models with kind/path/loaded |
| `InlineComplete` | ✅ | ✅ | ❌ | ❌ | `desktop-hidden` | Implemented; desktop uses ChatStream instead |
| `Chat` | ✅ | ✅ | ❌ | ❌ | `desktop-hidden` | Implemented; desktop uses ChatStream instead |
| `ChatStream` | ✅ | ✅ | ✅ | ❌ | `transitional` | Streaming chat; semantics ambiguous (token/done overlap, no error event) |
| `Embed` | ✅ | ✅ | ❌ | ❌ | `desktop-hidden` | Implemented; used internally via Rerank |
| `Rerank` | ✅ | ✅ | ✅ | ❌ | `implemented` | Cosine similarity ranking via embed model |
| `ResolveDrift` | ✅ | ✅ | ✅ | ❌ | `implemented` | Merge Yjs updates |
| `EnqueueBackgroundTask` | ✅ | ✅ | ✅ | ❌ | `implemented` | Queue explain/expand/research tasks |
| `ListBackgroundTasks` | ✅ | ✅ | ✅ | ❌ | `implemented` | Query background task status |

### Agent Client Dual-Path Behavior

The desktop `AgentClient` has two runtime paths:
- **agentd path**: Uses gRPC to `soma-agentd` (Unix socket)
- **openai-compatible path**: Direct HTTP calls to OpenAI-compatible endpoints (Ollama, etc.)

This means not all agent features are strictly bound to `agent.proto`. See Phase 3 deliverable.

---

## space.v1.MembershipService (P2P / declared only)

| RPC | Proto | Backend Server | Desktop | Status | Notes |
|-----|-------|----------------|---------|--------|-------|
| `SubmitJoinRequest` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server; daemon handles join via libp2p protocol |
| `SubscribeJoinRequests` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server |
| `DecideJoin` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server; daemon has `Daemon/DecideJoin` instead |
| `SubscribeJoinDecisions` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server |
| `GrantIssuer` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server |
| `PublishRevocation` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server |
| `SubscribeRevocations` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server |

**Resolution:** `MembershipService` is a design-time artifact. The join/membership flow is implemented via:
- `Daemon/JoinSpace` → libp2p `/soma/join/1` protocol
- `Daemon/DecideJoin` → libp2p `/soma/join-decision/1` protocol
- Storage via `soma-membership` crate

Desktop stubs are generated for message types but the service is not bound.

---

## space.v1.MailboxService (P2P / declared only)

| RPC | Proto | Backend Server | Desktop | Status | Notes |
|-----|-------|----------------|---------|--------|-------|
| `PutItem` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server; mailbox is DB-backed in botd/daemon |
| `Fetch` | ✅ | ❌ | ❌ | `declared-only` | No gRPC server; used internally via libp2p |

**Resolution:** `MailboxService` is used for message types but not exposed as a gRPC server. Mailbox operations are internal to `soma-membership` and `soma-peer`.

---

## High-Risk Semantic Gaps

These require documentation and/or fixes before backend/desktop can evolve independently:

### 1. `JoinSpace` is async submission, not approval

- **Current:** Returns `request_id` immediately; approval arrives via `JoinDecisionEvent` later
- **Risk:** UI may assume immediate success/failure
- **Action:** Document async flow; consider renaming to `SubmitJoinRequest` in future version

### 2. `reject-pending` encoding

- **Current:** Bot may return a rejection-like placeholder when manual approval is pending
- **Risk:** Ambiguous state; cannot distinguish "rejected" from "waiting for manual"
- **Action:** Formalize pending state or stop encoding as reject

### 3. `StreamEvents` duplication

- **Current:** `joinSubmitted` can emit multiple times on reconnect
- **Risk:** UI may treat each emit as a new request
- **Action:** Document reconnect semantics; consider event IDs for dedup

### 4. `ListJoinRequests` scope

- **Current:** Returns only pending incoming requests
- **Risk:** Name suggests broader scope; may need outgoing request tracking
- **Action:** Document current scope; add `ListMyJoinRequests` for outgoing if needed

### 5. `ReadBlobResponse.mime` hardcoded

- **Current:** Backend ignores stored MIME; always returns `application/octet-stream`
- **Risk:** UI cannot rely on MIME for rendering decisions
- **Action:** Fix to return stored MIME or document limitation

### 6. `ChatStream` semantics

- **Current:** Token stream followed by `done` event with full content; no explicit error event
- **Risk:** Error handling unclear; cannot abort mid-stream
- **Action:** Freeze semantics or redesign before treating as stable

---

## Action Items by Priority

### P0 (Breakage Risk)

1. Document `JoinSpace` async semantics
2. Document `StreamEvents` duplication behavior
3. Fix or document `ReadBlobResponse.mime` limitation

### P1 (Misleading API)

1. Decide: implement `IssueIssuerCapability` or remove from proto
2. Decide: implement `DiscoverSpaces` or remove from proto
3. Decide: expose `GetBlobMetadata` / `ListBlobs` in desktop or mark intentional

### P2 (Dead Declarations)

1. Mark `MembershipService` as `declared-only` in proto comments or remove service block
2. Mark `MailboxService` as `declared-only` in proto comments or remove service block

---

## Next Steps (Phase 2-5)

- **Phase 2:** Document and fix high-risk semantics
- **Phase 3:** Decide agent contract ownership (agentd vs openai-compatible)
- **Phase 4:** Remove/quarantine dead declarations
- **Phase 5:** Add contract tests (proto smoke, desktop wrapper tests)