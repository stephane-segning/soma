---
layout: home

hero:
  name: Soma
  text: Local-first workspaces for private collaboration.
  tagline: Desktop notes, peer sync, content-addressed blobs, and optional local AI for teams that need useful work to continue when the network does not.
  image:
    src: /soma-mark.svg
    alt: Soma mark
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Read the Architecture
      link: /architecture/soma-tapia
    - theme: alt
      text: View V2 Plan
      link: /02-v2

features:
  - title: Desktop-first, offline-capable
    details: Soma keeps already-available spaces, pages, and attachments usable on the device, even when connectivity is weak or temporarily absent.
  - title: Private spaces with explicit trust
    details: Membership is capability-based, device identities are cryptographic, and bots only act when they have been intentionally authorized.
  - title: Peer sync without cloud lock-in
    details: Peers discover and fetch data over libp2p, with relay and rendezvous infrastructure helping connectivity rather than owning the content.
  - title: Content-addressed attachments
    details: Blobs live outside collaborative document state and are fetched by verified CIDs, so cache peers can improve availability without becoming upload endpoints.
  - title: Soma plus Tapia
    details: The monorepo ships the main Soma desktop app, the focused Tapia companion, shared UI packages, Rust daemons, and packaging automation.
  - title: Developer-ready docs
    details: Start from setup, architecture, contracts, backend flows, desktop UI conventions, packaging, security, and deployment references.
---

## Quick Paths

- [Overview](00-overview.md) explains the product shape and core ideas.
- [Getting Started](getting-started/index.md) gets the daemon, desktop app, and optional server peers running.
- [End-to-End Flows](architecture/e2e-flows.md) traces join, blob, and local AI paths through the stack.
- [Blobs and VDFs](architecture/blobs-vdfs.md) describes verified CID fetch and cache-only peers.
- [UI Components](development/ui-components.md) documents the shared desktop UI package and Storybook workflow.
