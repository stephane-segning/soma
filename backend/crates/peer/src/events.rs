use std::sync::Arc;

use async_trait::async_trait;

use crate::PeerEvent;

/// Compact discriminator for routing peer events to interested handlers.
#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum PeerEventKind {
    NewListenAddr,
    ListenerClosed,
    ConnectionEstablished,
    ConnectionError,
    PingOk,
    PingErr,
    IdentifyReceived,
    MdnsDiscovered,
    RendezvousDiscovered,
    RelayReserved,
    RelayCircuitEstablished,
    JoinRequestSubmitted,
    JoinRequestDeliverySubmitted,
    JoinRequestDeliveryAck,
    JoinRequestDeliveryFailed,
    JoinDecision,
    JoinDecisionDeliverySubmitted,
    JoinDecisionDeliveryAck,
    JoinDecisionDeliveryFailed,
    JoinFailed,
    YooptaBlobAdded,
}

impl PeerEventKind {
    /// Static list of all kinds (used to size dispatch tables).
    pub const ALL: &'static [PeerEventKind] = &[
        PeerEventKind::NewListenAddr,
        PeerEventKind::ListenerClosed,
        PeerEventKind::ConnectionEstablished,
        PeerEventKind::ConnectionError,
        PeerEventKind::PingOk,
        PeerEventKind::PingErr,
        PeerEventKind::IdentifyReceived,
        PeerEventKind::MdnsDiscovered,
        PeerEventKind::RendezvousDiscovered,
        PeerEventKind::RelayReserved,
        PeerEventKind::RelayCircuitEstablished,
        PeerEventKind::JoinRequestSubmitted,
        PeerEventKind::JoinRequestDeliverySubmitted,
        PeerEventKind::JoinRequestDeliveryAck,
        PeerEventKind::JoinRequestDeliveryFailed,
        PeerEventKind::JoinDecision,
        PeerEventKind::JoinDecisionDeliverySubmitted,
        PeerEventKind::JoinDecisionDeliveryAck,
        PeerEventKind::JoinDecisionDeliveryFailed,
        PeerEventKind::JoinFailed,
        PeerEventKind::YooptaBlobAdded,
    ];

    /// Map a runtime event to its kind for routing.
    pub fn of(event: &PeerEvent) -> Self {
        match event {
            PeerEvent::NewListenAddr { .. } => PeerEventKind::NewListenAddr,
            PeerEvent::ListenerClosed { .. } => PeerEventKind::ListenerClosed,
            PeerEvent::ConnectionEstablished { .. } => PeerEventKind::ConnectionEstablished,
            PeerEvent::ConnectionError { .. } => PeerEventKind::ConnectionError,
            PeerEvent::PingOk { .. } => PeerEventKind::PingOk,
            PeerEvent::PingErr { .. } => PeerEventKind::PingErr,
            PeerEvent::IdentifyReceived { .. } => PeerEventKind::IdentifyReceived,
            PeerEvent::MdnsDiscovered { .. } => PeerEventKind::MdnsDiscovered,
            PeerEvent::RendezvousDiscovered { .. } => PeerEventKind::RendezvousDiscovered,
            PeerEvent::RelayReserved { .. } => PeerEventKind::RelayReserved,
            PeerEvent::RelayCircuitEstablished { .. } => PeerEventKind::RelayCircuitEstablished,
            PeerEvent::JoinRequestSubmitted { .. } => PeerEventKind::JoinRequestSubmitted,
            PeerEvent::JoinRequestDeliverySubmitted { .. } => {
                PeerEventKind::JoinRequestDeliverySubmitted
            }
            PeerEvent::JoinRequestDeliveryAck { .. } => PeerEventKind::JoinRequestDeliveryAck,
            PeerEvent::JoinRequestDeliveryFailed { .. } => PeerEventKind::JoinRequestDeliveryFailed,
            PeerEvent::JoinDecision { .. } => PeerEventKind::JoinDecision,
            PeerEvent::JoinDecisionDeliverySubmitted { .. } => {
                PeerEventKind::JoinDecisionDeliverySubmitted
            }
            PeerEvent::JoinDecisionDeliveryAck { .. } => PeerEventKind::JoinDecisionDeliveryAck,
            PeerEvent::JoinDecisionDeliveryFailed { .. } => {
                PeerEventKind::JoinDecisionDeliveryFailed
            }
            PeerEvent::JoinFailed { .. } => PeerEventKind::JoinFailed,
            PeerEvent::YooptaBlobAdded { .. } => PeerEventKind::YooptaBlobAdded,
        }
    }

    /// Index into a pre-sized dispatch table.
    pub fn index(self) -> usize {
        match self {
            PeerEventKind::NewListenAddr => 0,
            PeerEventKind::ListenerClosed => 1,
            PeerEventKind::ConnectionEstablished => 2,
            PeerEventKind::ConnectionError => 3,
            PeerEventKind::PingOk => 4,
            PeerEventKind::PingErr => 5,
            PeerEventKind::IdentifyReceived => 6,
            PeerEventKind::MdnsDiscovered => 7,
            PeerEventKind::RendezvousDiscovered => 8,
            PeerEventKind::RelayReserved => 9,
            PeerEventKind::RelayCircuitEstablished => 10,
            PeerEventKind::JoinRequestSubmitted => 11,
            PeerEventKind::JoinRequestDeliverySubmitted => 12,
            PeerEventKind::JoinRequestDeliveryAck => 13,
            PeerEventKind::JoinRequestDeliveryFailed => 14,
            PeerEventKind::JoinDecision => 15,
            PeerEventKind::JoinDecisionDeliverySubmitted => 16,
            PeerEventKind::JoinDecisionDeliveryAck => 17,
            PeerEventKind::JoinDecisionDeliveryFailed => 18,
            PeerEventKind::JoinFailed => 19,
            PeerEventKind::YooptaBlobAdded => 20,
        }
    }
}

/// Consumer of peer events.
#[async_trait]
pub trait PeerEventHandler<Ctx>: Send + Sync {
    /// Which event kinds this handler wants to receive.
    fn interests(&self) -> &'static [PeerEventKind];

    /// React to a peer event. Handlers should be fast; if you need isolation,
    /// consider giving the handler its own queue/worker.
    async fn handle(&self, ctx: &Ctx, event: &PeerEvent);
}

/// Dispatches peer events to registered handlers by kind.
pub struct PeerEventDispatcher<Ctx> {
    handlers_by_kind: Vec<Vec<Arc<dyn PeerEventHandler<Ctx>>>>,
}

impl<Ctx> PeerEventDispatcher<Ctx> {
    /// Build a dispatcher from a set of handlers.
    pub fn new(handlers: Vec<Arc<dyn PeerEventHandler<Ctx>>>) -> Self {
        let mut handlers_by_kind = vec![Vec::new(); PeerEventKind::ALL.len()];

        for handler in handlers {
            for &kind in handler.interests() {
                handlers_by_kind[kind.index()].push(handler.clone());
            }
        }

        Self { handlers_by_kind }
    }

    /// Dispatch an event to all interested handlers. Handlers are invoked sequentially.
    pub async fn dispatch(&self, ctx: &Ctx, event: &PeerEvent) {
        let kind = PeerEventKind::of(event);
        for handler in self
            .handlers_by_kind
            .get(kind.index())
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            handler.handle(ctx, event).await;
        }
    }
}

/// Wrap a handler with its own bounded queue and background worker to avoid blocking dispatch.
pub fn handler_with_queue<Ctx>(
    ctx: Arc<Ctx>,
    handler: Arc<dyn PeerEventHandler<Ctx>>,
    capacity: usize,
) -> (Arc<dyn PeerEventHandler<Ctx>>, tokio::task::JoinHandle<()>)
where
    Ctx: Send + Sync + 'static,
{
    use tokio::sync::mpsc;

    #[derive(Clone)]
    struct HandlerQueue<Ctx> {
        handler: Arc<dyn PeerEventHandler<Ctx>>,
        tx: mpsc::Sender<crate::PeerEvent>,
    }

    #[async_trait]
    impl<Ctx> PeerEventHandler<Ctx> for HandlerQueue<Ctx>
    where
        Ctx: Send + Sync + 'static,
    {
        fn interests(&self) -> &'static [PeerEventKind] {
            self.handler.interests()
        }

        async fn handle(&self, _ctx: &Ctx, event: &crate::PeerEvent) {
            let _ = self.tx.try_send(event.clone());
        }
    }

    let (tx, mut rx) = mpsc::channel::<crate::PeerEvent>(capacity);
    let worker_handler = handler.clone();
    let worker_ctx = ctx.clone();
    let join = tokio::spawn(async move {
        while let Some(evt) = rx.recv().await {
            let handler = worker_handler.clone();
            handler.handle(&worker_ctx, &evt).await;
        }
    });

    (Arc::new(HandlerQueue { handler, tx }), join)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use tokio::time::Duration;

    struct RecordingHandler {
        interests: &'static [PeerEventKind],
        hits: Arc<Mutex<Vec<PeerEventKind>>>,
    }

    #[async_trait]
    impl PeerEventHandler<()> for RecordingHandler {
        fn interests(&self) -> &'static [PeerEventKind] {
            self.interests
        }

        async fn handle(&self, _ctx: &(), event: &PeerEvent) {
            let kind = PeerEventKind::of(event);
            self.hits.lock().unwrap().push(kind);
        }
    }

    #[tokio::test]
    async fn dispatches_to_interested_handlers_only() {
        let hits_a = Arc::new(Mutex::new(Vec::new()));
        let hits_b = Arc::new(Mutex::new(Vec::new()));

        let handler_a = Arc::new(RecordingHandler {
            interests: &[PeerEventKind::PingOk, PeerEventKind::PingErr],
            hits: hits_a.clone(),
        });
        let handler_b = Arc::new(RecordingHandler {
            interests: &[PeerEventKind::JoinDecision],
            hits: hits_b.clone(),
        });

        let dispatcher = PeerEventDispatcher::new(vec![handler_a, handler_b]);

        let ping_evt = PeerEvent::PingOk {
            rtt: Duration::from_millis(10),
        };
        let join_evt = PeerEvent::JoinDecision {
            from: libp2p::PeerId::random(),
            decision: soma_proto_build::spaceroom::JoinDecision::default(),
        };

        dispatcher.dispatch(&(), &ping_evt).await;
        dispatcher.dispatch(&(), &join_evt).await;

        assert_eq!(hits_a.lock().unwrap().as_slice(), &[PeerEventKind::PingOk]);
        assert_eq!(
            hits_b.lock().unwrap().as_slice(),
            &[PeerEventKind::JoinDecision]
        );
    }
}
