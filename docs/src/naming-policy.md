# Naming Policy

This document defines the canonical terminology for the Soma codebase. All new docs, code, and contracts should use these terms.

**Last Updated:** 2026-03-20

---

## Core Concepts

### Space

A **space** is the primary unit of collaboration. It contains documents, members, and resources.

**Use:**
- `space` (noun) in docs, code, UI
- `space_id` for identifiers
- `SpaceId` in proto/types

**Do NOT use:**
- `class` (historical term from earlier versions)
- `room` (confuses with chat room concept)

**Examples:**
- `ListSpaces` (RPC)
- `space_members` (table)
- `/spaces/:spaceId` (route)

---

### Document

A **document** is collaborative content within a space. Documents are edited collaboratively and may reference blobs.

**Use:**
- `document` (noun) in docs, code, UI
- `document_id` for identifiers
- `DocumentId` in proto/types

**Do NOT use:**
- `page` when referring to the content itself (pages are navigation metadata)
- `Yoopta document` (internal implementation detail)

**Examples:**
- `UpsertDocument` (RPC)
- `documents` (table)
- `DocumentEditor` (component)

---

### Cache Peer

A **cache peer** is a libp2p peer that fetches and caches blobs addressed by content ID. Cache peers never accept user uploads and are not a source of truth.

**Use:**
- `cache peer` in docs and external communication
- `cache_peer` in code when the concept is external-facing

**Internal code may use:**
- `VDF` as an internal acronym (from "Verified Data Fetcher")
- `soma-vdfs` as the crate name (historical, to be renamed later)

**Do NOT use:**
- `VDFS` (inconsistent with VDF acronym)
- `cache bot` (confuses with general-purpose bots)

**Migration path:**
- Crate `soma-vdfs` → `soma-blobs` (Phase 6)
- Doc `blobs-vdfs.md` → `blobs-cache-peers.md` (Phase 2)

---

### Admin Mode

**Admin mode** is the operating mode of `somad bot` that exposes administrative HTTP endpoints for join decisions, issuer delegation, and space management.

**Use:**
- `admin` as the mode name
- `--mode admin` in CLI
- `SOMA_MODE=admin` in environment

**Do NOT use:**
- `server-daemon` (confuses with desktop daemon)

---

## Event Naming

Events should follow the pattern: `<entity>_<action>`

**Current:**
- `YooptaBlobAddedEvent` → **Transitional** (alias added in Phase 5)
- `yoopta_blob_added` → **Transitional** (alias added in Phase 5)

**Target:**
- `DocumentBlobAddedEvent` → **Implemented** (Phase 5)
- `document_blob_added` → **Implemented** (Phase 5)

**Migration:**
- ✅ Add new names as aliases (Phase 5 - COMPLETE)
- Remove old names (Phase 6)

---

## Proto Package Naming

**Current:**
- `space.v1` → **Implemented** (Phase 6)

**Migration:**

---

## Binary / Crate Naming

| Name | Kind | Purpose | Notes |
|------|------|---------|-------|
| `somad` | Binary | Unified server binary with `bot` / `relay` / `rendezvous` / `bff` / `all` subcommands | Stable; replaces the former per-service `soma-botd` / `soma-relayd` / `soma-rendezvousd` / `soma-bffd` / `soma-serverd` binaries |
| `soma-daemon` | Library | Desktop peer / daemon runtime | Stable; embedded by the Tauri host (`desktop-daemon`), no standalone binary |
| `soma-agentd` | Library | Desktop agent runtime (Yjs drift resolver, etc.) | Stable; embedded by the Tauri host (`desktop-agent`), no standalone binary |

---

## Directory Naming

### Desktop Workspace

**Target (completed):**
- `desktop/desktop-ui`
- `desktop/desktop-config`
- `desktop/desktop-editor`
- `desktop/desktop-icons`

(The Electron-era `desktop/desktop-proto` (`@soma/proto`) and
`desktop/desktop-data` (`@soma/desktop-db`) packages, along with the
`backend/crates/soma-node` (`@soma/node`) napi addon, were removed with the
Electron app. The current desktop app is the Tauri V2 shell at
`desktop/desktop-app`.)

---

## Historical Terms (Do Not Revive)

| Term | Origin | Why Deprecated |
|------|--------|----------------|
| `class` | Early classroom focus | `space` is broader |
| `Yoopta` | Editor library | Implementation detail |
| `VDFS` | Inconsistent acronym | Use VDF or cache peer |
| `server-daemon` | Confusing | Use admin mode |
| `spaceroom` | Proto package | Renamed to space.v1 (Phase 6) |
| `electron` | Previous desktop framework | Use Tauri V2 / `desktop/desktop-app` |

---

## Implementation Checklist

When adding new code/docs:

- [ ] Uses `space` not `class`
- [ ] Uses `document` for collaborative content
- [ ] Uses `cache peer` in external-facing docs
- [ ] Uses `admin` for bot admin mode
- [ ] Avoids historical framework names (tauri, etc.)
- [ ] Events follow `<entity>_<action>` pattern
