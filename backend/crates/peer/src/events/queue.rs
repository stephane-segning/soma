use crate::PeerEvent;
use crate::events::{PeerEventHandler, PeerEventKind};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Wrap a handler with its own bounded queue and background worker to avoid blocking dispatch.
pub fn handler_with_queue<Ctx>(
    ctx: Arc<Ctx>,
    handler: Arc<dyn PeerEventHandler<Ctx>>,
    capacity: usize,
) -> (Arc<dyn PeerEventHandler<Ctx>>, tokio::task::JoinHandle<()>)
where
    Ctx: Send + Sync + 'static,
{
    #[derive(Clone)]
    struct HandlerQueue<Ctx> {
        handler: Arc<dyn PeerEventHandler<Ctx>>,
        tx: mpsc::Sender<PeerEvent>,
    }

    #[async_trait]
    impl<Ctx> PeerEventHandler<Ctx> for HandlerQueue<Ctx>
    where
        Ctx: Send + Sync + 'static,
    {
        fn interests(&self) -> &'static [PeerEventKind] {
            self.handler.interests()
        }

        async fn handle(&self, _ctx: &Ctx, event: &PeerEvent) {
            let _ = self.tx.try_send(event.clone());
        }
    }

    let (tx, mut rx) = mpsc::channel::<PeerEvent>(capacity);
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
