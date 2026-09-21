//! Adapts a [`BlobResolver`] into a [`PeerEventHandler`] so it can be
//! registered in any `PeerEventDispatcher<Ctx>` — the same
//! Chain-of-Responsibility pattern every other peer-event consumer in this
//! codebase uses (see `soma_daemon::handlers` / `somad bot`'s
//! `event_handlers`). Generic over `Ctx`: the resolver owns all the state
//! it needs internally, so it has no use for whatever context type the
//! embedding binary dispatches with.

use async_trait::async_trait;
use std::sync::Arc;

use crate::PeerEvent;
use crate::blob::resolver::BlobResolver;
use crate::events::{PeerEventHandler, PeerEventKind};

pub struct BlobResolverBridge {
    resolver: Arc<dyn BlobResolver>,
}

impl BlobResolverBridge {
    pub fn new(resolver: Arc<dyn BlobResolver>) -> Self {
        Self { resolver }
    }
}

#[async_trait]
impl<Ctx> PeerEventHandler<Ctx> for BlobResolverBridge
where
    Ctx: Send + Sync,
{
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::IdentifyReceived,
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::BlobResponseReceived,
        ]
    }

    async fn handle(&self, _ctx: &Ctx, event: &PeerEvent) {
        self.resolver.observe(event).await;
    }
}
