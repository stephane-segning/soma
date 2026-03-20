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
- Daemon gRPC (Unix socket).
- Botd admin HTTP (if it ever exposes read APIs).

Controllers are thin; the check should live in the service layer so all surfaces reuse it.

## Where membership is enforced today
- libp2p blobs: blob handler calls `SpaceAuthorizer` before serving bytes.
- Daemon gRPC: `UploadBlob`/`UpsertDocument` require membership.
- Join decisions: membership capabilities are signature/subject/issuer-checked before persistence; issuer delegations are verified when the owner key is known.

## Verification rules
- Verify signatures with the signer’s libp2p public key (from Identify).
- Bind `subject_peer_id` to the remote peer identity (not payload).
- Enforce expiry on membership and issuer capabilities.
- Delegation chain: owner signs issuer cap → issuer signs membership cap.

## Notes and gaps
- Owner public key discovery is required to validate delegations where owner ≠ sender.
- UI guardrails should redirect non-members from space routes, but the backend is the security boundary.
- Future work: revocation + key rotation, and optional end-to-end encryption by space.
