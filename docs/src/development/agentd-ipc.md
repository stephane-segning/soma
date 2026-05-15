# Agentd IPC

`soma-agentd` is the local helper process for desktop-only background helpers.

Current implemented responsibilities include:

- service status and an empty compatibility model listing
- Yjs drift merge / resolution
- persisted background task tracking

## Current Topology

The current desktop topology is:

- renderer -> Electron main -> `soma-agentd`

This is the current implemented path for Soma's main-process agent client.

There is still a broader architectural desire to move more policy mediation behind `soma-daemon`, but the docs for this page describe the current direct main-process -> `soma-agentd` reality.

## Transport

`soma-agentd` uses local gRPC over a Unix domain socket.

Default socket naming follows the desktop stage configuration:

- prod Linux: `$XDG_RUNTIME_DIR/soma/soma-agentd.sock`
- prod macOS: `$TMPDIR/soma/soma-agentd.sock`
- dev: `/tmp/soma-agentd-dev.sock`
- staging: `/tmp/soma-agentd-staging.sock`

The matching daemon sockets follow the same stage suffix rules.

## gRPC Surface

Proto:

- `proto/agent/v1/agent.proto`

TypeScript/Electron consumers use:

- `desktop/desktop-proto` as `@soma/proto`

Key RPCs currently exposed by `soma-agentd` include:

- `Status`
- `ListModels` (compatibility only; returns no models)
- `ResolveDrift`
- `EnqueueBackgroundTask`
- `ListBackgroundTasks`

The proto still contains `Chat`, `ChatStream`, `InlineComplete`, `Embed`, and `Rerank`, but the Rust `soma-agentd` service now returns `UNIMPLEMENTED` for those model-backed methods.

## Important Behavior Notes

- model capability metadata used by the UI is still local desktop configuration, not an agentd-owned contract
- `soma-agentd` is local IPC, not a network service

## Runtime Events To Renderer

Soma main forwards runtime updates to the renderer on `agent_event`.

Relevant code paths:

- schema: `desktop/desktp-data/src/events.ts`
- main forwarder: `desktop/soma/src/main/services/agent-events.ts`
- renderer listener: `desktop/soma/src/renderer/src/services/agent-events.ts`

Current event kinds include:

- `ready`
- `status`
- `error`

## Operational Notes

- keep `soma-agentd` local-only
- keep the socket path aligned with the app stage
- when debugging model availability, use the explicit model provider path, not `soma-agentd`

For the current compatibility boundary, see `docs/src/development/agentd-models.md`.
