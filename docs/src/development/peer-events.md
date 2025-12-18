# Peer Event Handling (Dispatch + Backpressure)

Soma peers surface a stream of `PeerEvent` values (connectivity, discovery, relay, join flow).
To keep binaries small and composable, we route these events through a shared dispatcher with per-handler isolation.

## Building Blocks

- `PeerEventKind`: compact discriminator for the event enum (`NewListenAddr`, `PingOk`, `JoinDecision`, …).
- `PeerEventHandler<Ctx>`: handlers declare `interests() -> &'static [PeerEventKind]` and implement `async fn handle(&self, ctx: &Ctx, evt: &PeerEvent)`.
- `PeerEventDispatcher<Ctx>`: precomputes a routing table (kind → handlers) and dispatches with a single match per event.

Source: `backend/crates/peer/src/events.rs`

## Backpressure model (daemon example)

In `soma-daemon`, each handler is wrapped in its own `mpsc` queue/worker:

- Dispatcher only enqueues events for handlers that care about the event kind.
- `try_send` is used to avoid blocking the peer loop; full queues drop events (log/metrics can be added per handler).
- Workers run in background tasks and call `handler.handle(...)` sequentially per handler.

See `backend/bins/daemon/src/main.rs` and `backend/bins/daemon/src/handlers.rs`.

## Adding a new handler

1) Implement the trait:

```rust
struct MyHandler;

#[async_trait::async_trait]
impl PeerEventHandler<MyCtx> for MyHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::JoinDecision]
    }

    async fn handle(&self, ctx: &MyCtx, evt: &PeerEvent) {
        if let PeerEvent::JoinDecision { from, decision } = evt {
            // do something with ctx + decision
        }
    }
}
```

2) Register it in the binary’s dispatcher wiring (wrap it with a queue if you need isolation).

## Why this pattern

- Avoids “N handlers × match” per event; routing is precomputed.
- Keeps handler concerns cohesive (logging, metrics, join events) and testable in isolation.
- Backpressure is explicit: slow handlers can’t stall the peer loop.
