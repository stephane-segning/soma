# libp2p Primer for Soma Developers

Soma builds on libp2p for networking. This primer highlights the concepts you will encounter most often in the codebase and logs.

## Peer Identity (Peer ID)

- Each daemon generates a keypair (Ed25519 by default) on first launch and derives a Peer ID from the public key.[^security]
- Peer IDs are the canonical addresses peers use to authenticate each other; you will see them logged or encoded in invite links (`Qm...` style multihashes).
- The private key stays on disk with the daemon and is used to sign protocol messages or capability grants. Treat it as the source of truth for user identity.

## Protocols

- libp2p multiplexes named protocols (strings like `/soma/class/1.0.0`) over a single secure connection.
- Soma implements custom behaviours for chat, membership onboarding, content sync, etc., alongside built-in protocols such as identify or ping.
- When you add a new network feature, you usually define a new protocol ID, message schema, and handler to run inside the daemon’s `NetworkBehaviour`.

## Publish/Subscribe (Gossipsub)

- Soma uses libp2p Gossipsub for class-wide topics (chat, join events, announcements).[^pubsub]
- Peers subscribe to deterministic topic names per class and publish messages that are cryptographically signed so receivers know who sent them.[^security]
- Gossipsub is eventually consistent: there is no total ordering, so design application logic accordingly (e.g., include timestamps or sequence numbers where needed).

## Relays and Direct Connections

- libp2p always prefers direct connections using the addresses peers advertise (TCP, QUIC, WebRTC).
- When direct dialing fails because of NAT, peers reserve a slot on a Circuit Relay and exchange encrypted traffic through it.[^relay]
- After establishing a relayed session, libp2p attempts DCUtR (hole punching) to upgrade to a direct link automatically, reducing latency when possible.

## Peer Discovery (Rendezvous and mDNS)

- Soma peers connect to a rendezvous server, register under a namespace (e.g., `soma-prod`), and query for peers to bootstrap connectivity.[^rendezvous]
- On local networks developers can enable mDNS, letting daemons auto-discover each other without any infrastructure.
- You will see code paths for both discovery mechanisms—pay attention to configuration files or CLI flags when debugging peers that fail to connect.

[^security]: https://docs.libp2p.io/concepts/security/security-considerations/
[^pubsub]: https://docs.libp2p.io/concepts/publish-subscribe/gossipsub/
[^relay]: https://docs.libp2p.io/concepts/nat/circuit-relay/
[^rendezvous]: https://docs.libp2p.io/concepts/discovery-routing/rendezvous/
