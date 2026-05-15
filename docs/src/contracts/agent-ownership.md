# Agent Contract Ownership

**Status:** Documented

## Decision: agentd is not a model provider

The desktop agent surface has a compatibility proto for local helpers, but `soma-agentd` no longer owns model-provider behavior.

### Path 1: agentd (soma-agentd)

- **Protocol:** gRPC over Unix socket
- **Proto:** `proto/agent/v1/agent.proto`
- **Use case:** Yjs drift resolution and persisted background task records
- **Features fully bound to proto:**
  - `Status` / `ListModels` (compatibility; no models advertised)
  - `ResolveDrift` (Yjs merge)
  - `EnqueueBackgroundTask` / `ListBackgroundTasks`
- **Compatibility stubs:** `InlineComplete`, `Chat`, `ChatStream`, `Embed`, and `Rerank` return `UNIMPLEMENTED` from agentd.

### Path 2: openai-compatible (HTTP)

- **Protocol:** HTTP REST to OpenAI-compatible endpoints
- **Use case:** Direct provider access (Ollama, OpenAI, etc.)
- **Features that bypass proto:**
  - `ChatStream`
  - `ListModels` (via `/models` endpoint)
  - `Rerank` (via `/embeddings` + cosine similarity)

## Why This Exists

1. **Clear ownership:** agentd remains a local helper service, not a provider adapter.
2. **Flexibility:** Users may run local models via Ollama without soma-agentd.
3. **Cloud fallback:** Some deployments prefer direct cloud provider access.
4. **Per-workspace config:** Different spaces can use different providers.

## Contract Implications

### Stable Contract (proto-bound)

- `ResolveDrift` - Yjs-specific, always via agentd
- `EnqueueBackgroundTask` / `ListBackgroundTasks` - task queue is agentd-local

### Compatibility Contract

- `ListModels`:
  - agentd path: empty list
  - openai-compatible path: model IDs from `/models`

- Model-backed agentd RPCs:
  - proto declarations remain for generated-client compatibility
  - Rust `soma-agentd` returns `UNIMPLEMENTED`

### No Contract (provider-specific)

- Model availability, capabilities, latency
- These are inherently provider-specific and documented as such

## Documentation Requirements

When updating `agent.proto`:

1. Mark proto-bound features clearly in comments
2. Document whether the method is local-helper-only or provider-backed
3. Update desktop `AgentClient` only when desktop behavior changes

## Future Considerations

If streaming chat becomes a critical contract:

1. Standardize streaming semantics in proto (error events, abort, etc.)
2. Implement it in the explicit provider path or `soma-bffd`
3. Add `chat_stream_mode` to `AgentRuntimeConfig` for explicit control

For now, agentd model RPCs are compatibility stubs only.
