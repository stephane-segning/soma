# `soma-agentd` model providers (OpenAI-compatible)

`soma-agentd` no longer runs local `llama.cpp`/GGUF inference inside the daemon process.

Instead, it proxies to an OpenAI-compatible HTTP endpoint (for example Ollama or LM Studio), while keeping the same local gRPC surface for Soma desktop.

## What `soma-agentd` does now

- Binary: `backend/bins/agentd` (`cargo run -p soma-agentd`)
- IPC transport: Unix socket gRPC (`proto/agent/v1/agent.proto`)
- Upstream model provider: OpenAI-compatible HTTP APIs:
  - `GET /models`
  - `POST /chat/completions`
  - `POST /embeddings`

## Configuration

`soma-agentd` CLI/env options:

- `--socket-path` / `SOMA_AGENTD_SOCKET` (default: `/tmp/soma-agentd.sock`)
- `--provider-base-url` / `SOMA_AGENTD_PROVIDER_BASE_URL` (default: `http://127.0.0.1:11434/v1`)
- `--provider-api-key` / `SOMA_AGENTD_PROVIDER_API_KEY` (optional bearer token)
- `--default-chat-model` / `SOMA_AGENTD_DEFAULT_CHAT_MODEL` (default: `llama3.2`)
- `--default-embed-model` / `SOMA_AGENTD_DEFAULT_EMBED_MODEL` (default: `nomic-embed-text`)
- `--request-timeout-ms` / `SOMA_AGENTD_REQUEST_TIMEOUT_MS` (default: `30000`)

Example:

```bash
cargo run -p soma-agentd -- \
  --socket-path /tmp/soma-agentd-dev.sock \
  --provider-base-url http://127.0.0.1:11434/v1 \
  --default-chat-model llama3.2 \
  --default-embed-model nomic-embed-text
```

## Model capabilities in Soma UI

Provider `/models` responses do not guarantee capability metadata (chat/embed/tool/image).

Soma therefore treats capabilities as local UI configuration:

- Global capability map lives in the Soma settings (`agent.config` in electron-store).
- Per-workspace overrides also live in `agent.config.workspaces[space_id]`.
- These capability hints are local-only and are never synced to `soma-daemon`/network peers.

## Notes

- `ResolveDrift` remains local and is still handled by `soma-agentd` (Yjs merge).
- `Rerank` is implemented via embeddings + cosine similarity in `soma-agentd`.
- If provider requests fail, check URL, API key, and that the upstream endpoint exposes OpenAI-compatible routes.
