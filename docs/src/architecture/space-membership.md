# Space Membership System

Spaces are secure collaboration units. Access is governed by explicit capabilities so only authorized peers can read or publish space content. This document explains the main artifacts and how a join is processed end-to-end.

## Core Concepts

### JoinRequest

- Created by a user's Soma daemon when they attempt to join a space.
- Contains the requester's Peer ID, target space identifier, and any invite metadata.
- Delivered over the current libp2p request/response join flow to a known target peer or decider.

### MembershipCapability

- The signed credential proving that a peer belongs to a space.
- Stored inside the requesting daemon once issued so membership survives restarts.
- Encodes the granted membership for the requesting peer and may carry role information.

### Human-facing roles

- `Owner` - full workspace control, including access and settings.
- `Editor` - can create and edit workspace content.
- `Viewer` - can open and read content, but should not edit.
- `Member` - general workspace access when you do not want a more specific role yet.
- `Bot` - non-human peer used for approved automation, caching, or indexing. Join approval authority is separate and must be delegated explicitly.

### Bot action categories

- `cache and serve` - fetch, verify, cache, and serve allowed content.
- `organize and index` - classify, extract metadata, or prepare search/index views.
- `automation and script execution` - run approved workflows or scripts.

These categories are not implied just by assigning the `Bot` role. They must be granted intentionally for that space.

### IssuerCapability

- Grants authority to create MembershipCapabilities for a space.
- Issued by the space owner to a delegate peer through `Daemon/IssueIssuerCapability` or admin tooling.
- Stored as an owner-signed artifact and checked for space, delegate, role, and expiry before it can mint membership.

### SpaceGenesisArtifact

- Owner-signed proof for the initial space record.
- Created by the daemon during `CreateSpace` and stored beside the local `spaces` row.
- Lets peers verify that `owner_peer_id` is not only DB-local metadata.

### Bot Onboarding

- Bots receive join requests over the current join protocol, evaluate policy, and issue MembershipCapabilities when authorized.
- Delivery can happen immediately over the join decision path or later through the mailbox/outbox retry path.
- Bots may still trigger follow-up automation, but the core implemented responsibility is join decisioning and related persistence.

## Join Flow

1. **JoinRequest sent** – the Soma desktop app asks the local daemon to join a space; the daemon sends a JoinRequest over libp2p.
2. **Request processed** – the space bot or owner/issuer peer receives the request, verifies policy, and checks IssuerCapability permissions.
3. **Membership granted** – A MembershipCapability is created, typically by signing a statement `Peer X is a member of Space Y` with the issuer’s key.
4. **Delivery** – The credential is sent back to the requester’s daemon, which stores it securely.
5. **Access unlocked** – the daemon persists the membership outcome and informs the UI that the space is now available.
6. **Ongoing enforcement** – peers verify and enforce membership across the implemented protected surfaces.

Revocation can be implemented by expiring capabilities, publishing revocation events, or rotating space secrets. Regardless of the specifics, membership is always tied to the requesting peer’s ID, leveraging libp2p’s secure identity layer.[^security]

### Current implementation snapshot

- Transport: libp2p request/response protocol `/soma/join/1` (see `soma-peer`).
- Daemon: the in-process `DaemonHandle` (owned by the Tauri host's `desktop-daemon` crate) exposes `joinSpace`, then sends a JoinRequest over libp2p and surfaces decisions through the daemon event stream (relayed to the renderer as Tauri events).
- Join decisions: `somad bot` ships a real join decider that approves requests (optionally attaching an issuer capability if the bot has been delegated) and persists decisions/memberships to the shared SQLx storage.
- Bot operating modes:
  - `bot` mode (default): HTTP is read-only (`/info`, `/healthz`, `/metrics`); join decisions still flow over libp2p via the decider.
  - `admin` mode: exposes admin-token-gated join control endpoints over HTTP for admin tooling; controllers still delegate to the decider/storage and never "force-join".
- Auto-approval rules: the bot auto-approves only when it holds a valid issuer capability for the target space; otherwise join requests are recorded for manual approval. Manual approval surfaces exist in both the desktop daemon (via the in-process handle's `decideJoin`, surfaced to the renderer through `@soma/sdk`) and the bot's admin HTTP.
- Owner delegation: the daemon exposes `issueIssuerCapability` on its in-process handle; the current daemon must own the space, and the signed delegation is persisted for audit/reuse.
- Discovery: the daemon exposes `discoverSpaces`, but it currently returns only locally known/member spaces. Rendezvous-backed space discovery is still future work.
- Ownership proof: new daemon-created spaces carry an owner-signed genesis artifact in storage.
- Peer event pipeline: join decisions and failures are surfaced as `PeerEvent` and dispatched via the shared event dispatcher (see `docs/src/development/peer-events.md`).

### Current limitation: pending approval is transitional

- The transport and storage model already support asynchronous join approval.
- The proto does not yet expose a first-class `pending` decision state.
- Today, manual-approval placeholders are still encoded with reject-shaped values and a `pending manual approval` reason.
- Desktop UX should therefore describe join as "request access and wait for approval" rather than implying instant membership.

See `docs/src/contracts/join-semantics.md` for the current workaround and the planned protocol cleanup.

[^security]: https://docs.libp2p.io/concepts/security/security-considerations/
