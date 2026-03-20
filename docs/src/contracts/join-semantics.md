# Join Flow Semantics

This document defines the contract for space join flows between backend (daemon/bot) and desktop.

**Status:** Transitional - some semantics need formalization

---

## Overview

The join flow is **asynchronous**: `JoinSpace` returns a submission ID, and the approval/rejection arrives later via `StreamEvents`. This is intentional for offline-friendly P2P operation.

## RPC Contracts

### `Daemon/JoinSpace`

**Contract:**
- **Input:** `space_id`, `target_peer_id`, `target_multiaddrs`, optional `display_name`/`device_name`
- **Output:** `request_id` (opaque tracking ID)
- **Side effects:**
  1. Persists outgoing join request to `join_requests` table (`is_outgoing=true`)
  2. Enqueues delivery via mailbox (`mailbox` table)
  3. Emits `JoinSubmitEvent` via `StreamEvents`
  4. Sends libp2p `/soma/join/1` request to target peer
- **Does NOT indicate approval or rejection**
- **Errors:**
  - `INVALID_ARGUMENT`: missing required fields
  - `INTERNAL`: peer not running, enqueue failed

**Semantics:**
```
Submit → Receive request_id → Wait for JoinDecisionEvent → Apply decision
```

**Client responsibilities:**
- Do not assume immediate success
- Subscribe to `StreamEvents` before or immediately after calling
- Correlate events via `request_id` if needed

---

### `Daemon/ListJoinRequests`

**Contract:**
- **Scope:** Incoming pending join requests where this peer is the target (`is_outgoing=false`, `status=pending`)
- **Does NOT include:** Outgoing requests submitted by this peer

**Semantics:**
- Used by owners/bots to see pending approvals
- To track outgoing requests, correlate with `JoinSubmitEvent` events

---

### `Daemon/DecideJoin`

**Contract:**
- **Input:** `request_id`, `approve`, optional `role`, optional `reason`
- **Authorization:** Caller must be space owner OR hold valid issuer capability
- **Side effects:**
  1. Records decision in `join_decisions` table
  2. On approve: creates `space_memberships` row with signed capability
  3. Enqueues delivery via mailbox
  4. Sends libp2p `/soma/join-decision/1` to requester if online

---

## Event Contracts

### `JoinSubmitEvent`

Emitted when `JoinSpace` is called locally.

**Fields:**
- `request_id`: matches RPC response
- `target_peer_id`: the peer the request was sent to

**Duplication:**
- Currently **can emit multiple times** if `StreamEvents` reconnects
- No deduplication on server side
- **Client must deduplicate** based on `request_id` + timestamp if needed

---

### `JoinDecisionEvent`

Emitted when a join decision is received from a remote peer.

**Fields:**
- `from_peer_id`: the peer that sent the decision
- `decision`: the `JoinDecision` proto

**Handling:**
- Backend persists decision and membership on receipt
- Desktop receives via event stream and updates UI state

---

### `JoinFailedEvent`

Emitted when an outgoing join request cannot be delivered.

**Fields:**
- `target_peer_id`: the peer that was unreachable
- `error`: error message

**Handling:**
- Request is persisted and retried via mailbox when peer comes online
- Client may show retry status

---

## Pending State Encoding (Current)

**Problem:** The proto has no `JoinDecisionType::Pending` enum value.

**Current workaround:**
- Bot returns `JoinDecision` with:
  - `decision = JoinDecisionType::JoinRejected`
  - `decision_id = "reject-pending manual approval"`
  - `reason = "pending manual approval"`
- Handlers check `decision_id.starts_with("reject-pending")` to ignore these placeholders

**Risks:**
1. Relies on string prefix in `decision_id` field
2. `JoinRejected` enum value is semantically incorrect
3. Clients cannot distinguish "rejected" from "waiting for approval"

**Proposed fix (Phase 2):**

Option A: Add `JoinDecisionType::PENDING` to proto
```proto
enum JoinDecisionType {
  JOIN_DECISION_UNSPECIFIED = 0;
  JOIN_APPROVED = 1;
  JOIN_REJECTED = 2;
  JOIN_BLOCKED = 3;
  JOIN_PENDING = 4; // NEW: explicit pending state
}
```

Option B: Keep current encoding but document clearly
- Add comment to proto explaining `reject-pending` prefix convention
- Document in this file as intentional workaround

---

## `ReadBlobResponse.mime` (Adjacent Issue)

**Current behavior:**
- `UploadBlob` stores the provided MIME type in `blobs.mime`
- `ReadBlob` returns hardcoded `mime = "application/octet-stream"`
- Stored MIME is NOT used

**Fix:**
- Update `ReadBlob` to return stored MIME from `BlobMetadata`
- Fallback to `application/octet-stream` if missing

---

## Contract Test Requirements

To prevent drift, the following should be tested:

1. **Daemon proto smoke:** Call each RPC against a running daemon, verify response structure
2. **Join flow smoke:** Submit join, verify event emission, receive decision
3. **Event dedup:** Verify `JoinSubmitEvent` behavior on reconnect
4. **Pending encoding:** Verify `reject-pending` handling in daemon/botd handlers