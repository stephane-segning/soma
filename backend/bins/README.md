# Backend Binaries (`backend/bins`)

This folder contains Rust binary crates for local and server-side “agent” processes.

## Desktop peer/agent binaries

- **`soma-daemon`** (`bins/daemon`): main libp2p peer/daemon for desktop; Unix socket IPC; no Axum.
- **`soma-agentd`** (`bins/agentd`): optional desktop companion for local automation/helpers; no Axum; does not own the peer identity.

## Server peer/infra binaries

- **`soma-botd`** (`bins/botd`): server-hosted libp2p peer/bot; Axum control plane + metrics; uses a blob storage pool.
- **`soma-relayd`** (`bins/relayd`): libp2p Circuit Relay service; Axum + metrics.
- **`soma-rendezvousd`** (`bins/rendezvousd`): libp2p Rendezvous discovery service; Axum + metrics.
- **`soma-bffd`** (`bins/bffd`): LLM BFF service (no libp2p); Axum + metrics.
- **`soma-serverd`** (`bins/serverd`): convenience wrapper with subcommands to run relay/rendezvous/bff.
