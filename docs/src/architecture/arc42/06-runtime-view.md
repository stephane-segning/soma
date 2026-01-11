# 6. Runtime View

This section highlights a few “important at runtime” scenarios that are useful when debugging end-to-end.

## 6.1 Desktop app startup

```mermaid
sequenceDiagram
  participant UI as Soma desktop app
  participant Daemon as soma-daemon (gRPC over UDS)

  UI->>Daemon: connect (unix socket)
  Daemon-->>UI: Status (peer_id, listen addrs)
  Note right of Daemon: daemon continues running\nif UI closes
```

## 6.2 Join flow (request → decision)

```mermaid
sequenceDiagram
  participant UI as Soma desktop app
  participant Daemon as soma-daemon
  participant Bot as soma-botd (join decider)

  UI->>Daemon: Daemon/JoinSpace(space_id, target_peer_id, addrs)
  Daemon->>Bot: /soma/join/1 JoinRequest
  Bot-->>Daemon: /soma/join/1 JoinDecision (approve/reject)
  Daemon-->>UI: event stream (joinSubmitted, joinDecision)
```

## 6.3 Blob fetch by CID (with VDF caching)

```mermaid
sequenceDiagram
  participant PeerA as soma-daemon (requester)
  participant PeerB as VDF peer (bot/daemon)

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
  participant Main as Tauri main
  participant Agent as soma-agentd

  Renderer->>Main: ipc: chatStream(messages)
  Main->>Agent: local request
  loop tokens
    Agent-->>Main: token chunk
    Main-->>Renderer: ipc event (token)
  end
  Agent-->>Main: done
  Main-->>Renderer: done
```

For a more detailed narrative, see `docs/src/architecture/e2e-flows.md`.
