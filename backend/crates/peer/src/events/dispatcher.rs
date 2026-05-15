use crate::PeerEvent;
use crate::events::PeerEventKind;
use async_trait::async_trait;
use std::sync::Arc;

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
