# Plan 01: Prevent Non‑Members from Reading Space Content

Goal: ensure a peer that is **not a member of a space** cannot read any **space-scoped content** (documents/messages/blobs) from another peer or server control plane.

Scope covered by this plan:
- Daemon gRPC surfaces (Unix socket) that persist or return space-scoped data
- libp2p request/response protocols (especially `/soma/blob/1`)
- Botd server-daemon HTTP (admin control plane)
- Desktop UI “routing”/UX guardrails (not the security boundary, but reduces accidental leakage)

Non-goals (for now):
- Full “end-to-end encryption + key rotation” across all content types (listed as Phase 4)
- Public HTTP read APIs on botd (bot mode remains read-only)

---

## Phase 0 — Define the security contract (1 short doc + invariants)

1) ~~Write a short security contract doc (new file under `docs/src/`):~~
   - ~~Title: “Space Authorization Model”~~
   - ~~Define “member” precisely: possession of a valid `MembershipCapability` for `space_id`:~~
     - ~~signed (non-empty `signed`)~~
     - ~~not expired (`expires_at` if present)~~
     - ~~subject matches the requester identity (libp2p `PeerId` on the secure channel)~~
     - ~~issuer is trusted:~~
       - ~~issuer == owner, OR~~
       - ~~issuer has a valid `IssuerCapability` delegation signed by owner for that space~~
   - ~~Define the invariant: **all reads** of space content require passing the membership check.~~
   - ~~Define the “server” surfaces: daemon (local), botd server-daemon (admin), libp2p (network).~~

Acceptance criteria:
- A reviewer can point to one place in code where “membership verification” happens and one place where every read path calls it.

---

## Phase 1 — Implement cryptographic verification primitives (core correctness)

Today, memberships are persisted/applied without verifying `cap.signed`.

2) ~~Add verification helpers (new module in `backend/crates/common` or `backend/crates/membership`):~~
   - ~~`verify_membership_capability(cap: &MembershipCapability, subject: &PeerId, identify_pubkey: &PublicKey, now: SystemTime) -> SomaResult<()>`~~
   - ~~`verify_issuer_capability(cap: &IssuerCapability, now: SystemTime) -> SomaResult<()>`~~
   - ~~`verify_signature(cbor: &[...], signature: &[...], signer: &PeerId, pubkey: &PublicKey) -> SomaResult<()>`~~
   - ~~IMPORTANT: bind `subject_peer_id` to the *actual* remote peer ID (not payload-supplied).~~
   - ~~IMPORTANT: enforce expiry on both issuer cap and membership cap.~~

Where to get keys:
- libp2p Identify gives you the remote public key; use that for signature verification of payloads that claim a signer peer id.

3) ~~Enforce verification at join decision receipt:~~
   - ~~In `backend/bins/daemon/src/handlers.rs` → `JoinDecisionPersistenceHandler`:~~
     - ~~before calling `apply_join_decision`, verify the `MembershipCapability` in the decision:~~
       - ~~verify the decision’s capability is signed~~
       - ~~verify membership cap’s `subject_peer_id` equals *our* peer id (this is a membership granted to us)~~
       - verify issuer chain (owner → issuer cap → membership cap) using Identify pubkeys **(still TODO: add issuer delegation validation once owner pubkey is available)**
   - ~~If verification fails, do not persist membership; emit a warning event/log.~~

4) ~~Enforce verification when a bot/daemon decides joins (decider side):~~
   - ~~Ensure `decide_join_request(...)` only produces approvals whose membership cap is signed correctly and has appropriate expiry/role.~~
   - ~~If issuer delegation is used, ensure it is checked consistently before auto-approving (owner-signed issuer cap, space/delegate/role match, non-expired).~~

Acceptance criteria:
- A forged membership capability (bad signature / wrong subject / expired) is rejected and never written into `space_memberships`.
- Join decisions that are “placeholder rejects” remain ignored as today.

---

## Phase 2 — Add authorization gates to ALL read surfaces (stop leaks)

### 2A) libp2p `/soma/blob/1` (highest risk today)

Problem: `backend/crates/peer/src/lib.rs` serves blobs purely by `(space_id, cid)` with no membership check.

5) ~~Add an authorization hook to blob serving:~~
   ~~Option A (preferred): extend the `BlobProvider` trait to require authorization context.~~
   - ~~Provide `soma-peer` a closure/trait `SpaceAuthorizer` and call it inside the blob request handler.~~

6) ~~Implement `SpaceAuthorizer` for daemon/botd:~~
   - ~~Use `space_memberships` in storage to check `space_id` membership for the requesting peer.~~
   - ~~For “issuer/owner” special cases: only treat owner as “member” if there is an actual membership record or an explicit rule.~~
   - Decide whether “public blobs” exist; default should be **no**.

Acceptance criteria:
- A non-member peer requesting `/soma/blob/1` for a space gets `found=false` (even if the blob exists locally).
- A member peer can still fetch and cache blobs as before.

### 2B) Documents / “messages” persistence + reads (daemon-side)

Problem: `UpsertDocument` writes documents with no membership check; reads aren’t implemented yet but will need gating.

7) ~~Add authorization checks to daemon gRPC methods that accept `space_id`:~~
   - ~~For `UploadBlob` (`backend/bins/daemon/src/grpc.rs`): require caller is a member of `space_id`.~~
     - ~~Note: gRPC is local UDS; still enforce to prevent accidental cross-user reads/writes on multi-user systems.~~
   - ~~For `UpsertDocument`: require membership for `space_id`.~~
   - Any future `GetDocument/ListDocuments/SyncDocuments` must require membership.

How to check membership locally:
- Use `self.state.repos.membership_repo().get_membership(space_id, &self.state.peer_id.to_string())`
- If missing: return `Status::permission_denied("not a member of this space")`

Acceptance criteria:
- Attempting to `UpsertDocument` for a non-member space fails with `PERMISSION_DENIED`.

### 2C) Botd server-daemon HTTP (admin control plane)

8) Keep admin-token gating as the outer gate, but ensure endpoints that act on a space also enforce:
   - If endpoint causes content to be served over libp2p, the libp2p layer still gates.
   - If botd ever adds read APIs (avoid unless needed), those must verify both admin token AND membership/role.

Acceptance criteria:
- No new botd HTTP endpoint returns space content without explicit authorization logic.

---

## Phase 3 — UI/UX guardrails (reduce accidental exposure; not the boundary)

9) Add a “space membership guard” in the desktop app routing:
   - On entering `/spaces/:spaceId/*`, call daemon `GetSpace(spaceId)` (already enforces membership) and redirect to `/spaces/landing` (or an error screen) on failure.
   - Avoid showing `spaceId` alone as proof of access.

10) Ensure caches are scoped and cleared:
   - Document drafts are daemon-owned and scoped by `(space_id, document_id)` in storage; keep it that way.
   - When a membership is revoked/removed (future work), clear any cached drafts/pages for that space.

Acceptance criteria:
- If you manually type a non-member space URL, the UI does not render the space layout/page editor; it redirects.

---

## Phase 4 — Optional: “Real” confidentiality at rest/in transit (E2EE)

Even with access control, a peer that stores plaintext could leak via disk compromise.

11) Decide whether blobs and documents need encryption:
   - If yes, define per-space keys and rotation policy.
   - Store only ciphertext in blob store and documents table.
   - Use capabilities to distribute/authorize keys.

12) Key rotation + revocation:
   - When membership revoked, rotate the space key; re-encrypt new content; optionally re-encrypt old content.
   - This is a bigger design effort; do after Phase 1–3 are solid.

Acceptance criteria:
- A non-member with raw disk access cannot decrypt space blobs/documents without keys.

---

## Testing Plan (do this alongside Phases 1–2)

13) Add Rust unit/integration tests:
   - Capability verification tests (good sig / bad sig / expired / wrong subject).
   - Peer blob auth tests:
     - spin up two peers with a blob provider
     - store a blob in a space on one peer
     - request it from a non-member peer → must fail
     - grant membership → must succeed
   - Daemon gRPC auth tests (if existing test harness exists; otherwise add minimal unit tests around the service methods).

Acceptance criteria:
- Tests fail on the current leakage behavior and pass once fixed.

---

## Rollout/Checklist

14) Add telemetry/metrics for denied access:
   - Emit a `PeerEvent` or metrics counter for “blob request denied (not member)”.
   - Log at `info`/`warn` depending on volume.

15) Verify “no accidental new surface”:
   - Grep for any new handler that returns `content_json`, blob bytes, or message bodies and ensure it calls the membership gate.

16) Manual validation:
   - Start `soma-daemon` + two peers.
   - Ensure non-member cannot fetch blob bytes by CID.
   - Ensure joining grants access and revocation (once implemented) removes it.
