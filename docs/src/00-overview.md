# Soma — Local-First Workspace Platform

Soma is a **desktop-first, offline-capable workspace platform** centered on structured note-taking and collaboration.

It is designed for:

- anyone who wants a structured, local-first note-taking app
- teams and small groups collaborating privately
- people working in offline-sensitive environments
- employees in organizations with restricted connectivity

It combines:
- a Notion-like note-taking experience
- private workspaces with memberships and approvals
- peer-to-peer data resolution and caching
- capability-based permissions for humans and bots
- optional local AI assistance
- a planned typing-practice surface (Tapia, to be merged in as the `/practice` route)

Human roles inside a space stay intentionally simple:

- owners manage access and settings
- editors can create and edit content
- viewers can read without editing
- members are general participants when you do not need a more specific role yet
- bots are non-human peers that must be granted access intentionally

Bot work should be framed in three categories:

- cache and serve content already allowed for that space
- organize and index content for search or structure
- run approved automation or scripts

None of these categories are implied just by giving a peer the Bot role.

Soma is designed to work:
- fully offline on a local network
- partially online (mixed local + remote)
- across the internet when available
without requiring a browser or cloud accounts.

The network model is simple:

- if a peer in the network already has the content, another peer should be able to resolve it from there
- internet infrastructure helps, but it is not supposed to be the only path to useful work
- private workspaces should be able to exist without sharing their content with the outside world

---

## Key ideas

### Spaces and workspaces
A **Space** is the main unit of sharing, permissions, and local collaboration.

A space contains:
- pages and structured notes
- documents
- attachments (blobs)
- optional AI-assisted workflows
- members (humans and bots)

A device can be enrolled in **multiple spaces at the same time**.

Workspaces are intended to support small groups who want to collaborate privately, without exposing content to the public internet by default.

---

### Local-first
- No mandatory server
- LAN-first discovery
- Internet is optional
- Data stays with the space

The peer-to-peer layer exists to improve reachability and availability, especially in places where the internet is expensive, unstable, filtered, or simply not always there.

---

### Bots
A **bot** is a special space member:

- can cache and serve resources
- can organize or index workspace content
- can perform approved automation
- can accept or process membership flows when authorized
- may run scripts or background jobs if granted that capability

Bots can run:

- on a NAS or shared server
- on an office or team machine
- on Soma-operated infrastructure
- on multiple locations for redundancy

Workspace owners or trusted admins can remove a bot at any time, which revokes its authority for that space.

---

### Identity & security
- No usernames or passwords
- Each device has a cryptographic identity (PeerId)
- Human names are UI-only
- Access is controlled by signed capabilities

Capabilities are intended to cover permissions for both humans and bots, such as:

- accepting new members
- reading and editing pages
- serving cached content
- running scripts or automation

---

### Architecture (high level)

- **Desktop app** (Tauri V2: React/Vite renderer over a Rust `src-tauri` host) with the daemon + agent runtimes embedded in-process and exposed to the renderer via `@soma/sdk` over Tauri commands
- **`somad` server binary** (with `bot` / `relay` / `rendezvous` / `bff` / `all` subcommands)
- **Bot peers** (`somad bot`: cache + onboarding)
- **Relay + Rendezvous** (`somad relay` / `somad rendezvous`: connectivity only)

---

## Tapia: typing practice inside Soma
Tapia is the focused typing-practice surface planned for the Soma desktop app.

- to be accessed at `/practice` inside Soma — there is no separate app to install or launch. The `/practice` route is **not yet wired in the Tauri app**; the migration is a tracked follow-up.
- short passages, generated drills, and per-session feedback
- pure-renderer (no daemon dependency); shares the same shell, theming, and shared UI packages as the rest of Soma
- intentionally narrower in scope than Soma's main workspace surfaces

---

## Design principles

- Offline-first > Cloud-first
- Capabilities > Accounts
- Explicit trust > Implicit trust
- Simple UX > Enterprise complexity
- Structured workspaces > generic file dumping
