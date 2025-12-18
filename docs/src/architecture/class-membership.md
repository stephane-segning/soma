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

1. **JoinRequest sent** – Tapia asks the local daemon to join a class; the daemon publishes or sends a JoinRequest packet.
2. **Request processed** – The class bot or admin agent receives the request, verifies the invite, and checks IssuerCapability permissions.
3. **Membership granted** – A MembershipCapability is created, typically by signing a statement `Peer X is a member of Class Y` with the issuer’s key.
4. **Delivery** – The credential is sent back to the requester’s daemon, which stores it securely.
5. **Access unlocked** – The daemon subscribes to the class pubsub topics, syncs documents, and informs Tapia that the class is now available.
6. **Ongoing enforcement** – Peers may verify that incoming messages are signed by members or consult bot-maintained member lists to reject unauthorized traffic.

Revocation can be implemented by expiring capabilities, publishing revocation events, or rotating class secrets. Regardless of the specifics, membership is always tied to the requesting peer’s ID, leveraging libp2p’s secure identity layer.[^security]

[^security]: https://docs.libp2p.io/concepts/security/security-considerations/
