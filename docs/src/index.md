# Soma Documentation

Soma is a local-first workspace app for structured notes, private collaboration, and peer sync that improves as peers become reachable.

Practical expectation:

- work already on this device stays usable on weak networks
- attachments already downloaded on this device stay usable
- joins, attachments not yet downloaded on this device, and some remote updates may wait for reachable authorized peers
- relay and discovery services help devices connect; an always-on bot can also help keep shared attachments available, but none of these guarantees instant delivery

Start with the [Overview](00-overview.md), [Getting Started](getting-started/index.md), and [Glossary](01-glossary.md), then dive deeper:

- [Platform Components](architecture/soma-tapia.md) – desktop apps, local daemon, and supporting infrastructure.
- [End-to-End Flows](architecture/e2e-flows.md) – join, blobs (CID fetch), and local AI flows.
- [libp2p Primer](architecture/libp2p-primer.md) – key concepts used throughout the codebase.
- [Peer Connectivity](architecture/peer-connectivity.md) – how peers discover and dial (mDNS, rendezvous, relays).
- [Space Membership](architecture/space-membership.md) – capability-based security model for spaces.
- [Blobs & Cache Peers](architecture/blobs-vdfs.md) – content-addressed blobs + fetch-by-CID protocol.
- [Traits & Abstractions](architecture/traits.md) – trait-first convention and how to apply it.
- [Getting Started](getting-started/index.md) – run `soma-daemon`, the Soma desktop app, and optional server peers.
- [Packaging & Deployment](architecture/deployment.md) – desktop installers plus relay/rendezvous operations.
