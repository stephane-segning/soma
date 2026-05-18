# `soma-agentd` model-provider status

`soma-agentd` is no longer a standalone binary and no longer an
OpenAI-compatible model provider or proxy.

It ships as a **library crate** (`backend/crates/agentd`, linked into the
`@soma/node` napi addon) that the Electron main process loads in-process.
Model/provider access for chat/embed/rerank goes through an explicit model
provider path on the JS side — the desktop OpenAI-compatible runtime
configuration in [agent-client.ts](../../../desktop/soma/src/main/services/agent-client.ts).

## What `soma-agentd` does now

- Library crate: `backend/crates/agentd` — exposes an in-process `AgentHandle`
  via the napi addon's `SomaHandle`.
- Local helpers retained:
  - `agentStatus`
  - `listModels` (returns an empty model list; the desktop side talks to
    Ollama / a remote endpoint instead)
  - `resolveDrift` (Yjs update merge)
- The Unix-socket gRPC surface, the `--socket-path` / `SOMA_AGENTD_SOCKET`
  flags, and the persisted background-task store are gone (the desktop side
  keeps an in-memory background-task store in JS).

## Configuration

The napi addon's `StartConfig` takes `agentdDbPath` (used today only as a
placeholder for future state). There are no `SOMA_AGENTD_*` environment
variables.

The previous `SOMA_AGENTD_PROVIDER_BASE_URL`,
`SOMA_AGENTD_PROVIDER_API_KEY`, `SOMA_AGENTD_DEFAULT_CHAT_MODEL`,
`SOMA_AGENTD_DEFAULT_EMBED_MODEL`, and `SOMA_AGENTD_REQUEST_TIMEOUT_MS` knobs
are no longer agentd options — model-provider configuration lives in the
desktop config layer instead.
