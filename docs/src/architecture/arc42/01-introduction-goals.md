# 1. Introduction and Goals

Soma is a local-first workspace platform for structured note-taking and collaboration, designed for reliability, privacy, and offline-friendly workflows.

## Stakeholders

- **Members**: access workspace content, take notes, and collaborate with peers.
- **Owners/Admins**: create/manage spaces, approve membership, and configure bots.
- **Workspace operators**: run optional infrastructure (bots, relay, rendezvous) and manage updates.
- **Developers**: extend the desktop apps, peer protocols, and storage.

## Primary goals

- **Local-first**: operate without a mandatory cloud backend.
- **Offline-capable**: work on LAN-only networks and degrade gracefully on poor internet.
- **Decentralized collaboration**: peer-to-peer networking with optional "connectivity-only" infra.
- **Capability-based security**: membership without accounts/passwords; explicit delegation to bots.
- **Fast UX**: responsive desktop apps with background networking handled by a daemon.

## Quality goals (top)

- **Security**: minimize exposed network surfaces on desktop; verify blob integrity by CID; signed capabilities.
- **Availability**: optional always-on bots (VDFs) improve availability/latency by caching.
- **Operability**: small number of binaries with health/metrics endpoints; container-friendly server daemons.
- **Maintainability**: shared Rust workspace crates; clear separation between controllers (IPC/HTTP) and business logic.
