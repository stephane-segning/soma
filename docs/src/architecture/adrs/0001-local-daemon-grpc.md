# ADR-0001: Local daemon — superseded by in-process napi addon

**Status:** Superseded.

## Context
The desktop UI must interact with networking, storage, and cryptography
without exposing network services.

## Original decision
Use a **local daemon** communicating with the UI via **gRPC over Unix Domain
Socket**.

- No TCP ports exposed
- Authenticated via IPC token
- High performance
- Small attack surface

## Current state

The desktop no longer spawns a separate daemon process. The peer / daemon
runtime and the agent runtime both ship as **library crates**
(`soma-daemon`, `soma-agentd`) linked into a napi-rs addon (`soma-node`)
loaded directly by the Electron main process. All daemon operations go through
in-process Rust calls; there is no socket, no gRPC, no `soma-socket` helper.

The original goals are preserved more cleanly than the gRPC topology achieved:

- No TCP ports exposed (still true; no transport at all).
- Authentication is moot — every caller already runs inside the same Electron
  main process as the daemon library.
- Performance is strictly better: zero serialization, zero context switches.
- Attack surface shrank: no Unix-socket listener, no proto deserialization on
  the hot path.

## Why this ADR is kept

The decision recorded here informed today's structure: the `handle/` module
inside `soma-daemon` (the in-process facade exposed via napi) is a direct
descendant of the gRPC service, mapping the same operations onto plain Rust
types. New ADRs should reference this one when discussing the desktop ↔
daemon boundary.
