# Agent Contract Ownership

**Status:** Documented

## Decision: agentd is not a model provider

The desktop agent surface has a compatibility proto for local helpers, but
`soma-agentd` no longer owns model-provider behavior — and the surface itself
has changed: `soma-agentd` is now a **library** linked into the `@soma/node`
napi addon, not a separate process with a gRPC-over-Unix-socket surface.

### Path 1: agentd library (in-process via `@soma/node`)

- **Surface:** in-process napi methods on the `SomaHandle` (`agentStatus`,
  `listModels`, `resolveDrift`).
- **Proto:** `proto/agent/v1/agent.proto` — kept as a record-shape reference
  only; the agentd library no longer serves it as a gRPC server.
- **Use case:** Yjs drift resolution and lightweight status.
- **Features fully bound to the library:**
  - `agentStatus` / `listModels` (the latter returns an empty list)
  - `resolveDrift` (Yjs merge)
- **Background tasks** that used to be persisted in a `soma-agentd` SQLite
  table are now tracked in an in-memory store on the JS side
  (`desktop/soma/src/main/services/agent-client/background-tasks.ts`).

### Path 2: openai-compatible (HTTP)

- **Protocol:** HTTP REST to OpenAI-compatible endpoints
- **Use case:** Direct provider access (Ollama, OpenAI, etc.)
- **Features that bypass the agent library:**
  - `chatStream`
  - `listModels` (via `/models` endpoint)
  - `rerank` (via `/embeddings` + cosine similarity)

## Why This Exists

1. **Clear ownership:** the agent library remains a local helper, not a
   provider adapter.
2. **Flexibility:** users may run local models via Ollama without changing the
   agent library.
3. **Cloud fallback:** some deployments prefer direct cloud provider access.
4. **Per-workspace config:** different spaces can use different providers.

## Contract Implications

### Stable Surface

- `resolveDrift` — Yjs-specific, always via the agent library.

### Compatibility Surface

- `listModels`:
  - agent-library path: empty list
  - openai-compatible path: model IDs from `/models`

### No Contract (provider-specific)

- Model availability, capabilities, latency
- These are inherently provider-specific and documented as such.

## Documentation Requirements

When updating `agent.proto`:

1. Mark library-bound features clearly in comments.
2. Document whether the method is local-helper-only or provider-backed.
3. Update desktop `AgentClient` only when desktop behavior changes.

## Future Considerations

If streaming chat becomes a critical contract:

1. Standardize streaming semantics in the explicit provider path.
2. Implement it in the explicit provider path or `somad bff`.
3. Add `chat_stream_mode` to `AgentRuntimeConfig` for explicit control.

For now, the agent library exposes only Yjs drift resolution and status.
