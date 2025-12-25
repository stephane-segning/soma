# 4. Solution Strategy

## Local daemon + thin UIs

- Desktop apps are UI-first and delegate networking/storage/security to `soma-daemon`.
- The daemon exposes gRPC over a Unix socket (UDS) to avoid exposing TCP services on user devices (see ADR-0001).

## libp2p for decentralized networking

- Each daemon/bot is a libp2p peer with a stable PeerId derived from its keypair.
- Discovery and connectivity use a layered approach: direct addresses, mDNS (LAN), rendezvous (internet discovery), relay fallback.

## Capability-based membership

- Membership is explicit and cryptographically verifiable (see ADR-0002).
- Bots may be delegated join authority via issuer capabilities; otherwise joins are manual.

## Cache-only peers (VDFs)

- `soma-botd` is a cache-only peer role intended to improve availability/latency (see ADR-0003).
- VDFs never accept user uploads; they fill caches only via fetch-by-CID with CID verification.

## Content-addressed blobs

- Large binary assets live outside collaborative state and are addressed by CID (SHA-256 hex today).
- Blob transfer is pull-based by CID over `/soma/blob/1` and is size-bounded (see blob docs and ADR-0004).

## Controller/service separation

- Axum/gRPC surfaces are controllers; peer runtime and repositories hold business logic.
- Peer events are routed through a dispatcher with bounded queues to avoid blocking the network loop.
