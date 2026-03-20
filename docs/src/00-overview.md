# Soma — Local-First Learning Platform

Soma is a **desktop-first, offline-capable learning and collaboration platform**
designed for schools.

It combines:
- structured course material (Notion-like tree + editor)
- peer-to-peer networking
- secure space membership
- optional local AI assistance
- a typing companion app (Tapia)

Soma is designed to work:
- fully offline on a local network
- partially online (mixed local + remote)
- across the internet when available
without requiring a browser or cloud accounts.

---

## Key ideas

### Spaces
A **Space** is the main unit of sharing and permissions.

A space contains:
- topics (tree structure)
- documents
- attachments (blobs)
- chat
- members (students, teachers, bots)

A device can be enrolled in **multiple spaces at the same time**.

---

### Local-first
- No mandatory server
- LAN-first discovery
- Internet is optional
- Data stays with the space

---

### Bots
A **bot** is a special space member:
- read-only
- caches resources
- serves content to students
- can onboard students when authorized

Bots can run:
- on a school NAS
- on Soma servers
- on multiple locations for redundancy

Teachers can remove a bot at any time, which:
- revokes its authority
- wipes its cached data for the space

---

### Identity & security
- No usernames or passwords
- Each device has a cryptographic identity (PeerId)
- Human names are UI-only
- Access is controlled by signed capabilities

---

### Architecture (high level)

- **Desktop UI** (Electron/Chromium + React)
- **Local daemon** (Rust, gRPC over Unix socket)
- **Agent service** (local AI, optional)
- **Bot daemons** (cache + onboarding)
- **Relay + Rendezvous** (connectivity only)

---

## Companion app: Tapia
Tapia is a typing-speed application shipped alongside Soma.

- launched via deep link from Soma
- no chat, no docs
- shares data via the same daemon
- optimized for typing exercises

---

## Design principles

- Offline-first > Cloud-first
- Capabilities > Accounts
- Explicit trust > Implicit trust
- Simple UX > Enterprise complexity
- Education-first
