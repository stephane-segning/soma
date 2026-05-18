---
layout: home

hero:
  name: Soma
  text: Local-first workspaces for private collaboration.
  tagline: Desktop notes, peer sync, content-addressed blobs, and optional local AI for teams that need useful work to continue when the network does not.
  image:
    src: /icon.png
    alt: Soma app icon
  actions:
    - theme: brand
      text: Install Soma
      link: "#install"
    - theme: alt
      text: Developer Setup
      link: /getting-started/
    - theme: alt
      text: Read the Architecture
      link: /architecture/soma-tapia

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

## Install

Soma ships as a single signed desktop app — Tapia is built in as the `/practice` route. Grab the right artifact for your platform from the [latest `desktop-v*` release](https://github.com/stephane-segning/soma/releases?q=desktop-v):

- **macOS (Apple Silicon)** — download `soma-desktop-<version>-macos-arm64.zip`, unzip, drag `Soma.app` into `~/Applications` (no `sudo`). The build is signed with a Developer ID and notarized, so Gatekeeper accepts it on first launch.
- **Linux (amd64 / arm64)** — download `soma-desktop-<version>-linux-<arch>.AppImage`, `chmod +x` it, and run it directly. Move it under `~/Applications/` if you want a stable path.

Every asset has a matching entry in the `SHA256SUMS.txt` asset on the release; verify with `sha256sum -c` or `shasum -a 256 -c` before launch if you want a paper-trail check.

To remove, just delete `Soma.app` (macOS) or the AppImage (Linux). User data lives at `~/Library/Application Support/Soma/` on macOS and `~/.local/share/soma/` on Linux — delete those too if you want a clean wipe.

## Quick Paths

- [Overview](00-overview.md) explains the product shape and core ideas.
- [Getting Started](getting-started/index.md) gets the daemon, desktop app, and optional server peers running.
- [Packaging and Deployment](architecture/deployment.md) explains how daemon, desktop, and bundle releases fit together.
- [End-to-End Flows](architecture/e2e-flows.md) traces join, blob, and local AI paths through the stack.
- [Blobs and VDFs](architecture/blobs-vdfs.md) describes verified CID fetch and cache-only peers.
- [UI Components](development/ui-components.md) documents the shared desktop UI package and Storybook workflow.
