# Agentd IPC and Security Model

`soma-agentd` is a long-running, CPU-heavy worker (OCR, hashing, indexing, Yjs reconciliation, local LLM inference). It should not be exposed directly to the Electron renderer.

!!! note
    `desktop/soma-app` (Tauri) is currently wiring the renderer → Tauri main process → `soma-agentd` directly for chat.
    The long-term recommended topology is still “UI → daemon → agentd” so that the daemon can enforce authn/authz and policy centrally.

## Recommended Topology

- Electron (renderer) → Electron (main) → `soma-daemon` → `soma-agentd`
- The UI only talks to `soma-daemon`.
- `soma-daemon` mediates access to `soma-agentd` and enforces permissions and policy.

This keeps the trust boundary small: the daemon owns identity/capabilities; the agent does compute.

## Transport

### Desktop

Use a Unix domain socket (UDS) between `soma-daemon` and `soma-agentd`:

- Bind under a per-user private directory (permissions `0700`), with socket permissions `0600`.
- Never bind `agentd` to TCP on desktop.

UDS is full-duplex and supports bidirectional communication.

### Server / cross-host

Do not reuse the desktop IPC protocol over the network. If a remote agent is ever needed, treat it as a separate server product with explicit authn/authz, rate limiting, and auditing.

## Performance Notes

Unix sockets are typically fast enough for control messages, job submissions, and streaming progress:

- They are kernel-mediated, low overhead, and full-duplex.
- The dominant cost is usually serialization and copies.

To keep things fast:

- Prefer binary formats (e.g., protobuf) over JSON for high-frequency messages.
- Do not stream large blobs over the socket. Instead:
  - store blobs in the blob pool and pass references (hash/path within the pool), or
  - use FD passing (`SCM_RIGHTS`) to hand off an open file descriptor where supported.

## gRPC surface (UDS)

Proto: `proto/agent/v1/agent.proto` (generated into `soma_proto_build::agent`).

- `Status` / `ListModels`: version, defaults, and model metadata (name, kind chat/embed, path, loaded flag, size bytes).
- `Chat` / `ChatStream` / `InlineComplete`: chat inference with optional model override.
- `Embed`: embed one or more strings with optional model override.
- `Rerank`: embeds `{query, candidates[]}` using the embed model and returns cosine-ranked `{id, score, rank}`; `top_n` limits output (0 = all).
- `ResolveDrift`: merges two Yjs updates (bytes) and returns a merged update; use this when reconciling document drift.

Keep the socket UDS-bound and mode 0600; treat all APIs as local-only IPC.

## Bidirectional Communication Patterns

You have two common patterns; both are bidirectional at the transport level:

1. **Request/Response + polling**
   - UI submits job → daemon → agentd returns job id.
   - UI polls daemon for status/result.
   - Simpler, robust.

2. **Streaming progress/events**
   - Client opens a stream subscription.
   - Agentd pushes progress updates and final results.
   - Best UX for long tasks (OCR/indexing).

If using gRPC over UDS (e.g., tonic), bidirectional streaming is first-class.

## Authentication and Authorization

Even on a per-user Unix socket, use application-level auth to avoid “any local same-user process can call it”:

- `soma-daemon` generates a random secret at startup.
- `soma-daemon` passes it to `soma-agentd` securely (env var at spawn time, or a `0600` file).
- `soma-agentd` requires that secret in a handshake before accepting requests.

Authorization should be enforced by `soma-daemon`:

- `soma-agentd` should not have access to identity keys/capabilities.
- `soma-agentd` should operate on explicit job inputs (blob references, text payloads) and return outputs.

## Safety Controls

To avoid UI-triggered resource exhaustion:

- Limit concurrency (e.g., max in-flight jobs).
- Limit input sizes (bytes, document lengths).
- Add timeouts per job type and per request.
- Add backpressure for streaming endpoints.
