# 6. Runtime View

This section highlights a few “important at runtime” scenarios that are useful when debugging end-to-end.

## 6.1 Desktop app startup

```mermaid
sequenceDiagram
  participant UI as Renderer (React)
  participant Main as Electron main (loads @soma/node addon)
  participant Daemon as soma-daemon library (in-process)

  Main->>Daemon: start(config) — loads libp2p, opens DB, builds DaemonHandle
  Daemon-->>Main: SomaHandle (peer_id, listen addrs)
  UI->>Main: ipc: status()
  Main-->>UI: peer_id, listen addrs
  Note over Main,Daemon: daemon runs as part of the Electron main process;\nshut down when the app quits
```

## 6.2 Join flow (request → decision)

```mermaid
sequenceDiagram
  participant UI as Renderer
  participant Main as Electron main + soma-daemon (in-process)
  participant Bot as somad bot (remote peer, join decider)

  UI->>Main: ipc: joinSpace(space_id, target_peer_id, addrs)
  Main->>Bot: /soma/join/1 JoinRequest (libp2p)
  Bot-->>Main: /soma/join/1 JoinDecision (approve/reject)
  Main-->>UI: event stream (joinSubmitted, joinDecision)
```

## 6.3 Blob fetch by CID (with VDF caching)

```mermaid
sequenceDiagram
  participant PeerA as Desktop peer (soma-daemon in-process)
  participant PeerB as VDF peer (somad bot or another desktop)

  PeerA->>PeerB: /soma/blob/1 BlobRequest(cid, space_id)
  alt hit
    PeerB-->>PeerA: BlobResponse(found=true, data)
  else miss
    PeerB-->>PeerA: BlobResponse(found=false)
  end
  Note over PeerA,PeerB: receivers verify CID before persisting/serving
```

## 6.4 Local AI (streaming tokens)

```mermaid
sequenceDiagram
  participant Renderer as Renderer (React)
  participant Main as Electron main (loads @soma/node)
  participant LLM as OpenAI-compatible LLM endpoint (Ollama / remote)

  Renderer->>Main: ipc: chatStream(messages)
  Main->>LLM: POST /v1/chat/completions (stream=true)
  loop tokens
    LLM-->>Main: SSE token chunk
    Main-->>Renderer: ipc event (token)
  end
  LLM-->>Main: [DONE]
  Main-->>Renderer: done
```

Note: drift resolution uses the in-process `soma-agentd` library (via the
`@soma/node` addon); chat / list-models / rerank still go out over HTTP to the
configured OpenAI-compatible endpoint.

For a more detailed narrative, see `docs/src/architecture/e2e-flows.md`.
