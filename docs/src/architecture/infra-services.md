# Infrastructure Services (Relay + Rendezvous)

Soma uses two lightweight libp2p infrastructure services to improve discovery and connectivity.

## Relay (`soma-relayd`)

The relay service runs the libp2p **Circuit Relay v2** server behaviour. Peers that cannot establish direct connections can reserve slots on the relay and route encrypted libp2p traffic through it.

## Rendezvous (`soma-rendezvousd`)

The rendezvous service runs the libp2p **Rendezvous server** behaviour. Peers register under namespaces and query for other registered peers to bootstrap connectivity.

For how peers consume relay/rendezvous (and the relevant CLI flags), see `docs/src/architecture/peer-connectivity.md`.

## Identity Persistence

Both services persist a libp2p keypair so their Peer ID remains stable across restarts.

- Env var: `SOMA_DATA_DIR`
- Defaults:
  - Relay: `./data/relay/identity.key`
  - Rendezvous: `./data/rendezvous/identity.key`

## Transports

The services listen on multiple transports simultaneously:

- **TCP**: baseline compatibility
- **QUIC (UDP)**: performance and often better NAT behavior (but UDP may be blocked)
- **WebSocket (WS)**: helpful for restrictive networks and web-like environments

The exact listen addrs are currently configured in the crate defaults.

## `soma-net` Swarm Builder

Soma centralizes libp2p transport wiring in `soma-net`. libp2p’s `SwarmBuilder` uses a typestate API; to compose multiple transports, the call order matters:

`TCP -> QUIC -> DNS -> WebSocket -> Behaviour`

If the swarm is built without QUIC support, attempting to `listen_on("/udp/.../quic-v1")` will fail with `MultiaddrNotSupported`.

## Health + Metrics

Both services expose an HTTP server (Axum) strictly for:

- `GET /healthz`
- `GET /metrics` (Prometheus text)

Service-specific counters track relay reservations/circuits and rendezvous registrations/discovers.
