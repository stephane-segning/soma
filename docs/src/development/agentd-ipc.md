# Agentd IPC

`soma-agentd` is the local helper process for model-backed and CPU-heavy work.

Current implemented responsibilities include:

- model status and model listing
- chat and chat-stream RPCs
- embeddings
- rerank
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

- prod: `/tmp/soma-agentd.sock`
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
- `ListModels`
- `Chat`
- `ChatStream`
- `InlineComplete`
- `Embed`
- `Rerank`
- `ResolveDrift`

## Important Behavior Notes

- model capability metadata used by the UI is still local desktop configuration, not a daemon-owned contract
- current chat streaming should be treated as the current implemented behavior, not as a guarantee of token-perfect provider streaming semantics
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
- when debugging model availability, start with `ListModels` and the configured provider base URL

For local provider/model configuration, see `docs/src/development/agentd-models.md`.
