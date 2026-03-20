# Agent Contract Ownership

**Status:** Documented

## Decision: Option B - Dual Path is Intentional

The desktop `AgentClient` intentionally supports two runtime paths:

### Path 1: agentd (soma-agentd)

- **Protocol:** gRPC over Unix socket
- **Proto:** `proto/agent/v1/agent.proto`
- **Use case:** Local LLM proxy, Yjs drift resolution, background tasks
- **Features fully bound to proto:**
  - `Status` / `ListModels`
  - `ResolveDrift` (Yjs merge)
  - `EnqueueBackgroundTask` / `ListBackgroundTasks`
  - `Rerank` (via embed model)

### Path 2: openai-compatible (HTTP)

- **Protocol:** HTTP REST to OpenAI-compatible endpoints
- **Use case:** Direct provider access (Ollama, OpenAI, etc.)
- **Features that bypass proto:**
  - `ChatStream` (non-streaming mode when provider != agentd)
  - `ListModels` (via `/models` endpoint)
  - `Rerank` (via `/embeddings` + cosine similarity)

## Why This Exists

1. **Flexibility:** Users may run local models via Ollama without soma-agentd
2. **Cloud fallback:** Some deployments prefer direct cloud provider access
3. **Per-workspace config:** Different spaces can use different providers

## Contract Implications

### Stable Contract (proto-bound)

- `ResolveDrift` - Yjs-specific, always via agentd
- `EnqueueBackgroundTask` / `ListBackgroundTasks` - task queue is agentd-local

### Transitional Contract (dual-path)

- `ChatStream`:
  - agentd path: true streaming (token events)
  - openai-compatible path: non-streaming (collects full response)
  - **Desktop client normalizes both to `StreamEvent` type**

- `ListModels`:
  - agentd path: model metadata with kind/path/loaded
  - openai-compatible path: just model IDs from `/models` endpoint

### No Contract (provider-specific)

- Model availability, capabilities, latency
- These are inherently provider-specific and documented as such

## Documentation Requirements

When updating `agent.proto`:

1. Mark proto-bound features clearly in comments
2. Document dual-path behavior in `docs/src/contracts/agent-semantics.md`
3. Update desktop `AgentClient` to maintain normalization layer

## Future Considerations

If streaming chat becomes a critical contract:

1. Standardize streaming semantics in proto (error events, abort, etc.)
2. Require openai-compatible path to use streaming if provider supports it
3. Add `chat_stream_mode` to `AgentRuntimeConfig` for explicit control

For now, the dual-path is intentional and documented.