# Class Membership System

Classes are secure collaboration spaces. Access is governed by explicit capabilities so only authorized peers can read or publish class content. This document explains the main artifacts and how a join is processed end-to-end.

## Core Concepts

### JoinRequest

- Created by a user’s Soma daemon when they attempt to join a class.
- Contains the requester’s Peer ID, target class identifier, and any invite metadata.
- Delivered either via a class-specific pubsub topic or directly to known admin peers/bots.

### MembershipCapability

- The signed credential proving that a peer belongs to a class.
- Stored inside the requesting daemon once issued so membership survives restarts.
- Can encode roles or permissions (student, teacher) if needed for future enforcement.

### IssuerCapability

- Grants authority to create MembershipCapabilities for a class.
- Held by class creators, trusted teachers, or onboarding bots.
- May be delegated—transferring this capability is effectively handing over admin rights.

### Bot Onboarding

- Bots subscribe to join signals, evaluate any policy (invite tokens, class limits), and issue MembershipCapabilities when the request is valid.
- Delivery can happen over the same libp2p stream that carried the JoinRequest or via a secure direct message.
- Bots can also broadcast welcome events or trigger follow-up automation (e.g., posting starter content).

## Join Flow

1. **JoinRequest sent** – Tapia asks the local daemon to join a space; the daemon publishes or sends a JoinRequest packet.
2. **Request processed** – The space bot or admin agent receives the request, verifies the invite, and checks IssuerCapability permissions.
3. **Membership granted** – A MembershipCapability is created, typically by signing a statement `Peer X is a member of Space Y` with the issuer’s key.
4. **Delivery** – The credential is sent back to the requester’s daemon, which stores it securely.
5. **Access unlocked** – The daemon subscribes to the class pubsub topics, syncs documents, and informs Tapia that the class is now available.
6. **Ongoing enforcement** – Peers may verify that incoming messages are signed by members or consult bot-maintained member lists to reject unauthorized traffic.

Revocation can be implemented by expiring capabilities, publishing revocation events, or rotating space secrets. Regardless of the specifics, membership is always tied to the requesting peer’s ID, leveraging libp2p’s secure identity layer.[^security]

### Current implementation snapshot

- Transport: libp2p request/response protocol `/soma/join/1` (see `soma-peer`).
- Daemon: exposes Join via gRPC over Unix socket (`Daemon/JoinSpace`), then sends a JoinRequest over libp2p and streams decisions over `Daemon/StreamEvents`.
- Join decisions: botd now ships a real join decider that approves requests (optionally attaching an issuer capability if the bot has been delegated) and persists decisions/memberships to the shared SQLx storage.
- Bot operating modes:
  - `bot` mode (default): HTTP is read-only (`/info`, `/healthz`, `/metrics`); join decisions still flow over libp2p via the decider.
  - `server-daemon` mode: exposes `/v1/join` (admin-token gated) to drive the same decider over HTTP for admin tooling; controllers still delegate to the decider/storage and never “force-join”.
- Auto-approval rules: botd auto-approves only when it holds a valid issuer capability for the target space; otherwise join requests are recorded for manual approval. Manual approval surfaces now exist in both soma-daemon (gRPC) and server-daemon HTTP.
- Peer event pipeline: join decisions and failures are surfaced as `PeerEvent` and dispatched via the shared event dispatcher (see `docs/src/development/peer-events.md`).

[^security]: https://docs.libp2p.io/concepts/security/security-considerations/
