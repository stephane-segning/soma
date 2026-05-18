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
      link: /architecture/arc42/03-context

features:
  - title: Desktop-first, offline-capable
    details: Soma keeps already-available spaces, pages, and attachments usable on the device, even when connectivity is weak or temporarily absent.
  - title: Private spaces with explicit trust
    details: Membership is capability-based, device identities are cryptographic, and bots only act when they have been intentionally authorized.
  - title: Peer sync without cloud lock-in
    details: Peers discover and fetch data over libp2p, with relay and rendezvous infrastructure helping connectivity rather than owning the content.
  - title: Content-addressed attachments
    details: Blobs live outside collaborative document state and are fetched by verified CIDs, so cache peers can improve availability without becoming upload endpoints.
  - title: Soma with built-in Tapia practice
    details: One Electron desktop app (Soma) with Tapia delivered as the `/practice` route. Shared UI packages, Rust runtime crates linked via the `@soma/node` napi addon, and packaging automation all live in the same monorepo.
  - title: Developer-ready docs
    details: Start from setup, architecture, contracts, backend flows, desktop UI conventions, packaging, security, and deployment references.
---

## Install

Soma ships as a single signed desktop app — Tapia is built in as the `/practice` route. Pick the download that fits your workflow; every link below resolves to the **latest release** automatically.

### macOS (Apple Silicon)

| Download | When to pick it |
| --- | --- |
| [**Soma — `.dmg`**](https://github.com/stephane-segning/soma/releases/latest/download/soma-desktop-macos-arm64.dmg) | **Standard.** Open the disk image and drag Soma into Applications. Signed with a Developer ID and notarized, so Gatekeeper accepts it on first launch. |
| [Soma — `.zip`](https://github.com/stephane-segning/soma/releases/latest/download/soma-desktop-macos-arm64.zip) | **Manual / no-Finder.** Unzip and drop `Soma.app` wherever you want it — `~/Applications/`, `/Applications/`, anywhere on disk. Same signed + notarized binary as the `.dmg`. |

### Linux

| Download | When to pick it |
| --- | --- |
| [**Soma — `.deb` (amd64)**](https://github.com/stephane-segning/soma/releases/latest/download/soma-desktop-linux-amd64.deb) · [**`.deb` (arm64)**](https://github.com/stephane-segning/soma/releases/latest/download/soma-desktop-linux-arm64.deb) | **Debian / Ubuntu / Pop!\_OS / Mint / any apt-based distro.** Install with `sudo apt install ./soma-desktop-linux-<arch>.deb`. Soma shows up in your application menu. |
| [Soma — `.AppImage` (amd64)](https://github.com/stephane-segning/soma/releases/latest/download/soma-desktop-linux-amd64.AppImage) · [`.AppImage` (arm64)](https://github.com/stephane-segning/soma/releases/latest/download/soma-desktop-linux-arm64.AppImage) | **No-install / portable.** `chmod +x` the file and run it directly — no root, no package manager touched. |

Looking for an older version or release notes? Browse the [full list of desktop releases](https://github.com/stephane-segning/soma/releases?q=desktop-v) — every previous version is still downloadable from its own tag.

### Verifying the download

Every asset is listed in [`SHA256SUMS.txt`](https://github.com/stephane-segning/soma/releases/latest/download/SHA256SUMS.txt) on the release. Verify with `sha256sum -c` (Linux) or `shasum -a 256 -c` (macOS) before launch if you want a paper-trail check.

### Uninstalling

- **macOS** — drag `Soma.app` to the Trash.
- **Linux (deb)** — `sudo apt remove soma`.
- **Linux (AppImage)** — delete the file.

User data lives at `~/Library/Application Support/Soma/` on macOS and `~/.local/share/soma/` on Linux — delete those too if you want a clean wipe.

## Quick Paths

- [Overview](00-overview.md) explains the product shape and core ideas.
- [Getting Started](getting-started/index.md) gets the desktop app and optional server peers running.
- [Packaging and Deployment](architecture/deployment.md) explains how desktop and server releases fit together.
- [End-to-End Flows](architecture/e2e-flows.md) traces join, blob, and local AI paths through the stack.
- [Blobs and VDFs](architecture/blobs-vdfs.md) describes verified CID fetch and cache-only peers.
- [UI Components](development/ui-components.md) documents the shared desktop UI package and Storybook workflow.
