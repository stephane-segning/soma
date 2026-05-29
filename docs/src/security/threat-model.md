# Threat Model

This page captures a practical threat model for Soma’s current architecture. It is not a formal verification document; it is meant to guide engineering decisions and reviews.

## High-level goals

- Keep user data local-first (no mandatory cloud).
- Prevent unauthorized peers from joining or reading space data.
- Keep infrastructure services "connectivity-only" (no plaintext user content).
- Make it hard for cache-only peers (bots) to become a source of truth.

## Assets to protect

- **Identity keys**: libp2p private keys (PeerId source of truth).
- **Capabilities**: membership and issuer delegation artifacts.
- **Local data**: documents, metadata, and cached state in local storage.
- **Blobs**: content-addressed binary assets stored outside collaborative state.
- **Admin tokens**: any bearer tokens used for mode-gated HTTP control planes (admin mode).

## Trust boundaries

### Desktop boundary

- **Renderer (untrusted UI surface)** → **Tauri `src-tauri` host (trusted local backend, including the `soma-daemon` and `soma-agentd` libraries embedded via the `desktop-daemon` / `desktop-agent` crates)**.
- There is no separate daemon process and no IPC socket. Daemon operations are plain Rust calls inside the host — the only boundary is the WebView-renderer ↔ host bridge, which is constrained to the `#[tauri::command]` surface exposed by `desktop-commands` (and gated by Tauri's capability/permission config).

### P2P boundary

- Remote peers and bots are **untrusted by default**.
- All network inputs (messages, blobs, metadata) must be treated as attacker-controlled.

### Infrastructure boundary

- `somad relay` and `somad rendezvous` are **connectivity-only**; they should not store or process application content beyond what libp2p protocols require.

## Threats and mitigations (by area)

### 1) Local compromise (same machine)

Threats:

- A malicious renderer payload triggers unsafe command calls into the Tauri host (confused deputy).
- Another local process tampers with the daemon's on-disk state (SQLite DB, blob directory, libp2p identity key) under the user's home directory.

Mitigations:

- Keep the renderer ↔ host command surface narrow; route privileged operations through the small, audited `desktop-commands` surface and Tauri's capability/permission config.
- Store the libp2p identity and DBs under the app data dir (`~/Library/Application Support/Soma/` on macOS, `~/.local/share/soma/` on Linux) with default file permissions and let the OS isolation do its job; we do not rely on app-level authentication for "is this the same user."
- See ADR-0001 for why we no longer maintain a separate daemon process / Unix-socket IPC surface.

### 2) Unauthorized membership / capability forgery

Threats:

- A peer forges membership artifacts or replays old approvals.
- A bot issues memberships without being delegated (or after delegation expired).

Mitigations:

- Treat capabilities as signed artifacts; verify signatures and expiry consistently (ADR-0002).
- Keep join deciders policy-driven (bot auto-approve only with valid issuer capability; otherwise manual).
- Persist join decisions and issuance events for auditability (storage layer).

Known gaps / follow-ups:

- Canonical signing format across versions is still an explicit follow-up (see repo notes about canonical CBOR).

### 3) Blob integrity and cache poisoning

Threats:

- A malicious peer serves incorrect bytes for a CID.
- A cache-only peer persists unverified bytes and later serves them (poisoned cache).

Mitigations:

- Always verify that bytes match the claimed CID before persisting/serving.
- Enforce size limits on ingress/egress for blob transfers.
- Keep VDFs (bots) cache-only: no upload endpoints; cache writes only as a side-effect of fetch+verify.

### 4) Denial of service (network and local)

Threats:

- Flood join requests, mailbox items, pubsub messages, or blob requests.
- Exhaust disk via large blobs or many cached objects.
- Tie up CPU via expensive verification or agent workloads.

Mitigations:

- Bound message sizes (protocol-level maximums) and enforce limits at controllers.
- Use backpressure and bounded queues for event handling (peer event dispatcher).
- Apply cache eviction policy (LRU/TTL/size cap) for VDFs/bots.
- Constrain local compute (agentd job concurrency, max tokens, timeouts).

### 5) Confidentiality leakage via infrastructure

Threats:

- Relay or rendezvous operators observe user content.

Mitigations:

- libp2p connections are encrypted/authenticated; relay forwards encrypted traffic only.
- Keep infra services stateless and minimize logging of sensitive metadata.

## Operational checklist (quick review)

- New IPC endpoint: does it avoid exposing raw filesystem paths or arbitrary command execution?
- New protocol: are message sizes bounded and inputs validated?
- Blob changes: is CID verification preserved before serve/persist?
- Bot mode HTTP: does it remain read-only? (write surfaces must be mode-gated and authenticated)
- Storage: are migrations applied at startup and errors fatal (no partial startup)?
