# `soma-agentd` model-provider status

`soma-agentd` is no longer an OpenAI-compatible model provider or proxy.

It still exposes the existing local gRPC service for compatibility, but model-backed RPCs are disabled in the Rust binary. Model/provider access should go through an explicit model provider path, such as the desktop OpenAI-compatible runtime configuration or `soma-bffd` where that is appropriate.

## What `soma-agentd` does now

- Binary: `backend/bins/agentd` (`cargo run -p soma-agentd`)
- IPC transport: Unix socket gRPC (`proto/agent/v1/agent.proto`)
- Local helpers retained:
  - `Status`
  - `ListModels` (returns an empty model list)
  - `ResolveDrift` (Yjs update merge)
  - `EnqueueBackgroundTask` / `ListBackgroundTasks` (persisted task records)

## Disabled compatibility RPCs

These proto methods still exist so generated clients continue to compile, but `soma-agentd` returns `UNIMPLEMENTED`:

- `InlineComplete`
- `Chat`
- `ChatStream`
- `Embed`
- `Rerank`

Background task enqueue remains available for storage compatibility. New enqueued tasks are persisted as failed with an error explaining that model-backed agentd RPCs are disabled.

## Configuration

`soma-agentd` CLI/env options:

- `--socket-path` / `SOMA_AGENTD_SOCKET` (default: `/tmp/soma-agentd.sock`)
- `--db-path` / `SOMA_AGENTD_DB_PATH` (default: `./agentd.db`)

Example:

```bash
cargo run -p soma-agentd -- \
  --socket-path /tmp/soma-agentd-dev.sock \
  --db-path .data/agentd-dev.db
```

## Notes

- `SOMA_AGENTD_PROVIDER_BASE_URL`, `SOMA_AGENTD_PROVIDER_API_KEY`, `SOMA_AGENTD_DEFAULT_CHAT_MODEL`, `SOMA_AGENTD_DEFAULT_EMBED_MODEL`, and `SOMA_AGENTD_REQUEST_TIMEOUT_MS` are no longer agentd options.
- `StatusResponse.default_chat_model`, `StatusResponse.default_embed_model`, and `ListModelsResponse.models` are retained in the proto response shape but are empty from `soma-agentd`.
