# Shared Contract Sources

`proto/` is the current source-of-truth directory for cross-runtime contracts used by both Rust and TypeScript consumers.

Current packages:

- `daemon/v1/daemon.proto` - desktop <-> `soma-daemon` IPC
- `agent/v1/agent.proto` - desktop <-> `soma-agentd` IPC
- `space/v1/membership.proto` - shared membership/capability messages

Current consumers:

- Rust: `backend/crates/proto-build`
- TypeScript: `desktop/desktop-proto`

Split-readiness note: both generators now support `SOMA_PROTO_ROOT` so they can be pointed at an external contracts checkout without moving files yet.
