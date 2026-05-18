# Backend Binaries (`backend/bins`)

This folder holds the only Rust binary shipped from this workspace:

- **`somad`** (`bins/somad`): unified server binary. Subcommands `bot`, `relay`,
  `rendezvous`, `bff`, and `all` (TOML-composed multi-mode) replace the former
  per-service `soma-botd` / `soma-relayd` / `soma-rendezvousd` / `soma-bffd` /
  `soma-serverd` binaries.

## Desktop runtime (no binary)

The desktop daemon + agent ship as **libraries** linked into the `@soma/node`
napi addon ([`crates/soma-node`](../crates/soma-node)) and consumed in-process
by the Electron main process. There is no desktop binary to launch and no IPC
socket.

- **`soma-daemon`** ([`crates/daemon`](../crates/daemon)): peer / daemon runtime
  — owns the libp2p identity, blob store, repositories, and event bus.
- **`soma-agentd`** ([`crates/agentd`](../crates/agentd)): agent runtime —
  Yjs drift resolver, etc.

Both expose a `run(RuntimeConfig)` entry point returning a `RuntimeHandle` with
an in-process `DaemonHandle` / `AgentHandle` accessor; the napi addon embeds
both and exposes a single `SomaHandle` to JS.

## Peer connectivity

`somad bot` and the embedded daemon use the same discovery / connectivity
helpers (mDNS, rendezvous, relay client). See
[`docs/src/architecture/peer-connectivity.md`](../../docs/src/architecture/peer-connectivity.md).
