# Class Membership System

Classes are secure collaboration spaces. Access is governed by explicit capabilities so only authorized peers can read or publish class content. This document explains the main artifacts and how a join is processed end-to-end.

## Core Concepts

### JoinRequest

- Created by a user’s Soma daemon when they attempt to join a class.
- Contains the requester’s Peer ID, target class identifier, and any invite metadata.
- Delivered over the current libp2p request/response join flow to a known target peer or decider.

### MembershipCapability

- The signed credential proving that a peer belongs to a class.
- Stored inside the requesting daemon once issued so membership survives restarts.
- Encodes the granted membership for the requesting peer and may carry role information.

### IssuerCapability

- Grants authority to create MembershipCapabilities for a class.
- Held by class creators, trusted teachers, or onboarding bots.
- May be delegated—transferring this capability is effectively handing over admin rights.

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
- Daemon: exposes Join via gRPC over Unix socket (`Daemon/JoinSpace`), then sends a JoinRequest over libp2p and streams decisions over `Daemon/StreamEvents`.
- Join decisions: botd now ships a real join decider that approves requests (optionally attaching an issuer capability if the bot has been delegated) and persists decisions/memberships to the shared SQLx storage.
- Bot operating modes:
  - `bot` mode (default): HTTP is read-only (`/info`, `/healthz`, `/metrics`); join decisions still flow over libp2p via the decider.
- `server-daemon` mode: exposes admin-token-gated join control endpoints over HTTP for admin tooling; controllers still delegate to the decider/storage and never “force-join”.
- Auto-approval rules: botd auto-approves only when it holds a valid issuer capability for the target space; otherwise join requests are recorded for manual approval. Manual approval surfaces now exist in both soma-daemon (gRPC) and server-daemon HTTP.
- Peer event pipeline: join decisions and failures are surfaced as `PeerEvent` and dispatched via the shared event dispatcher (see `docs/src/development/peer-events.md`).

[^security]: https://docs.libp2p.io/concepts/security/security-considerations/
