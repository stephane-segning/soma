# `soma-agentd` model-provider status

`soma-agentd` is no longer a standalone binary and no longer an
OpenAI-compatible model provider or proxy.

It ships as a **library crate** (`backend/crates/agentd`, embedded by the Tauri
host via the `desktop-agent` crate) that the `src-tauri` host loads in-process.
Model/provider access for chat/embed/rerank goes through `desktop-agent`'s
OpenAI-compatible client; the provider configuration source of truth is the
Tauri store, surfaced to the renderer through `@soma/sdk`.

## What `soma-agentd` does now

- Library crate: `backend/crates/agentd` — exposes an in-process `AgentHandle`
  owned by the Tauri host's `desktop-agent` crate.
- Local helpers retained:
  - `agentStatus`
  - `listModels` (returns an empty model list; the desktop side talks to
    Ollama / a remote endpoint instead)
  - `resolveDrift` (Yjs update merge)
- The Unix-socket gRPC surface, the `--socket-path` / `SOMA_AGENTD_SOCKET`
  flags, and the persisted background-task store are gone (the desktop side
  keeps an in-memory background-task store in JS).

## Configuration

The agent runtime shares the single embedded SQLite database with the daemon
(its tables fold in from the former `agentd.db`). There are no `SOMA_AGENTD_*`
environment variables.

The previous `SOMA_AGENTD_PROVIDER_BASE_URL`,
`SOMA_AGENTD_PROVIDER_API_KEY`, `SOMA_AGENTD_DEFAULT_CHAT_MODEL`,
`SOMA_AGENTD_DEFAULT_EMBED_MODEL`, and `SOMA_AGENTD_REQUEST_TIMEOUT_MS` knobs
are no longer agentd options — model-provider configuration lives in the
desktop config layer instead.
