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
- Space creation: `CreateSpace` stores owner metadata plus an owner-signed `SpaceGenesisArtifact`.
- Join decisions: membership capabilities are signature/subject/issuer-checked before persistence; delegated issuer chains are verified when the owner key is known.
- Issuer delegation: `IssueIssuerCapability` is implemented on daemon gRPC, requires the current daemon to own the space, and persists the owner-signed delegation locally.
- Discovery: `DiscoverSpaces` is implemented as local known-space discovery. It does not query rendezvous metadata yet.

## Verification rules
- Verify signatures with the signer’s libp2p public key (from Identify).
- Bind `subject_peer_id` to the remote peer identity (not payload).
- Enforce expiry on membership and issuer capabilities.
- Delegation chain: owner signs issuer cap → issuer signs membership cap.
- Reject signed capability payload mismatches so post-signature field tampering does not persist.

## Notes and gaps
- Owner public key discovery is required to validate delegations where owner ≠ sender.
- The signing payload uses the current CBOR view helpers; canonical CBOR remains a cross-version interoperability task.
- UI guardrails should redirect non-members from space routes, but the backend is the security boundary.
- Future work: revocation + key rotation, and optional end-to-end encryption by space.

## Terminology note

- `Owner`, `Editor`, `Viewer`, `Member`, and `Bot` are workspace access roles.
- Bot operating mode like `admin` is deployment/runtime terminology, not a human workspace role.
- Local AI model feature hints in the desktop UI are not security capabilities and do not grant access.
- A delegated approver is a separate authority concept. A bot may be a delegated approver, but the `Bot` role alone does not imply join approval powers.
