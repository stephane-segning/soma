# Soma Documentation

Welcome to the Soma documentation.

Start with the [Overview](00-overview.md), [Glossary](01-glossary.md), and [V2 Clarity Plan](02-v2.md), then dive deeper:

- [Platform Components](architecture/soma-tapia.md) – desktop apps, local daemon, and supporting infrastructure.
- [End-to-End Flows](architecture/e2e-flows.md) – join, blobs (CID fetch), and local AI flows.
- [libp2p Primer](architecture/libp2p-primer.md) – key concepts used throughout the codebase.
- [Peer Connectivity](architecture/peer-connectivity.md) – how peers discover and dial (mDNS, rendezvous, relays).
- [Space Membership](architecture/space-membership.md) – capability-based security model for spaces.
- [Blobs & Cache Peers](architecture/blobs-vdfs.md) – content-addressed blobs + fetch-by-CID protocol.
- [Traits & Abstractions](architecture/traits.md) – trait-first convention and how to apply it.
- [Getting Started](getting-started/index.md) – run `soma-daemon`, the Soma desktop app, and optional server peers.
- [Packaging & Deployment](architecture/deployment.md) – desktop installers plus relay/rendezvous operations.
