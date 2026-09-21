# Space Authorization Model

This document defines how Soma authorizes reads and writes of space-scoped content (documents, messages, blobs).

## What counts as a member?

Possession of a valid `MembershipCapability` for the target `space_id`:
- Signed (`signed` present).
- Subject matches the requester’s libp2p `PeerId` from the authenticated channel.
- Not expired (`expires_at` is in the future, if set).
- Issuer is trusted:
  - Issuer is the space owner, **or**
  - Issuer presents a valid `IssuerCapability` delegated by the owner for that space.

## Invariant: all space reads require membership

Every surface that returns space content must check membership:
- libp2p request/response (`/soma/blob/1` and any future protocols).
- In-process daemon surface exposed to the renderer via the Tauri host (`desktop-api` handlers → `desktop-commands` → `@soma/sdk`).
- `somad bot` admin HTTP (if it ever exposes read APIs).

Controllers are thin; the check should live in the service layer so all surfaces reuse it.

## Where membership is enforced today
- libp2p blobs: blob handler calls `SpaceAuthorizer` before serving bytes.
- In-process daemon (via the Tauri command surface): `uploadBlob`/`upsertDocument` require membership.
- Space creation: `CreateSpace` stores owner metadata plus an owner-signed `SpaceGenesisArtifact`.
- Join decisions: membership capabilities are signature/subject/issuer-checked before persistence; delegated issuer chains are verified when the owner key is known.
- Issuer delegation: `IssueIssuerCapability` is implemented on the in-process daemon surface, requires the current daemon to own the space, and persists the owner-signed delegation locally.
- Discovery: `DiscoverSpaces` is implemented as local known-space discovery. It does not query rendezvous metadata yet.

## Verification rules
- Verify signatures with the signer’s libp2p public key (from Identify).
- Bind `subject_peer_id` to the remote peer identity (not payload).
- Enforce expiry on membership and issuer capabilities.
- Delegation chain: owner signs issuer cap → issuer signs membership cap.
- Reject signed capability payload mismatches so post-signature field tampering does not persist.

## Space invites

A `soma://invite/<payload>` link is an **owner-signed, self-contained credential** — the
mechanism `soma_membership::invite` implements. It closes part of the TOFU gap described above:
without an invite, the *only* input to a first-contact trust decision is a peer id typed or
pasted out of band, with zero cryptographic binding to the space or to whoever handed it out. An
invite instead binds `(space_id, default_role, expires_at, bootstrap_multiaddrs, issuer)` into one
owner-signed unit, verifiable **before dialling anyone**.

- **Wire format**: CBOR (via `ciborium`) of the full signed `InviteState`, base64url-encoded
  (no padding), as `soma://invite/<payload>`. See `soma_common::invite_link` for the exact byte
  layout.
- **Offline verification**: `CborSigned.signer_public_key` (protobuf-encoded libp2p public key)
  is embedded directly in the invite — the one signed artifact in this schema that carries its
  own key, because this deployment's real identities are ECDSA (`soma_net::NetIdentity::generate`),
  whose peer ids do **not** embed the public key the way small Ed25519 keys can. Every other
  signed artifact (`MembershipCapability`, `IssuerCapability`, `SpaceGenesisArtifact`) is still
  verified exclusively through `PeerKeyResolver`/`TrustAnchor` against a locally-pinned key —
  `signer_public_key` is populated only for `InviteState` and must never be read by any other
  verifier. See `soma_common::verify_invite_state`'s doc comment for the precise, narrow claim
  this embedding does and doesn't prove.
- **Redemption pins the trust anchor**: `soma_membership::invite::redeem_invite` routes the
  verified issuer through the exact same `resolve_trust_anchor` / `pin_trust_anchor` primitives
  as every other first-contact path (never a parallel mechanism), and caches the issuer's
  verified public key into `peer_public_keys` so a later inbound `JoinDecision` can be
  signature-checked without waiting on a separate Identify exchange.
- **What is still TOFU**: the *first* time a device sees a given space, trusting that a
  particular invite link genuinely came from the expected owner is inherent to any invite-link
  system (Slack/Discord/Docs share links have the same property) — the improvement is that
  tampering with the link's terms in transit, or a MITM substituting a different issuer/role,
  breaks the signature and is rejected before any network contact, rather than being
  undetectable the way a bare pasted peer id is.
- **Replay protection**: issued invites and per-invite redemption counts are persisted
  (`invites` table / `soma_storage::invites::InviteRepository`); `try_consume` is a single
  guarded `UPDATE` so a single-use invite (the default) cannot be redeemed twice even under
  concurrent attempts. Decider-side auto-approval (`join_decider::storage`) trusts only its own
  previously-inserted `invites` row, looked up by nonce — never wire-provided invite fields —
  matching the same "local ground truth only" pattern as bot self-recruitment.

## Notes and gaps
- Owner public key discovery is required to validate delegations where owner ≠ sender.
- The signing payload uses the current CBOR view helpers; canonical CBOR remains a cross-version interoperability task.
- UI guardrails should redirect non-members from space routes, but the backend is the security boundary.
- Future work: revocation + key rotation, and optional end-to-end encryption by space.
- Invite `InviteProof` requester signatures are built (`soma_common::build_invite_proof`) but not
  yet verified server-side against the requester's own key — doing so needs the requester's
  public key, which this crate only ever sources from a prior Identify exchange
  (`PeerKeyResolver`), and nothing currently guarantees Identify completes before a `JoinRequest`
  arrives on a freshly-dialled connection. Auto-approval instead relies entirely on the decider's
  own locally-issued `invites` row (space match via the composite key, expiry, single-use nonce)
  — see `soma_membership::invite`'s module doc comment.

## Terminology note

- `Owner`, `Editor`, `Viewer`, `Member`, and `Bot` are workspace access roles.
- Bot operating mode like `admin` is deployment/runtime terminology, not a human workspace role.
- Local AI model feature hints in the desktop UI are not security capabilities and do not grant access.
- A delegated approver is a separate authority concept. A bot may be a delegated approver, but the `Bot` role alone does not imply join approval powers.
