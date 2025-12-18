use std::sync::Arc;

use async_trait::async_trait;
use soma_peer::events::{PeerEventDispatcher, PeerEventHandler, PeerEventKind};
use soma_peer::PeerEvent;
use tokio::sync::mpsc;

use crate::handlers::{JoinEventsHandler, ListenAddrHandler, LoggingHandler};
use crate::DaemonState;

/// Build the dispatcher and spin up per-handler workers for backpressure isolation.
pub async fn build_dispatcher(state: Arc<DaemonState>) -> PeerEventDispatcher<DaemonState> {
    const QUEUE_CAPACITY: usize = 64;

    // Helper to wrap a handler with its own queue/worker.
    fn wrap_with_worker(
        state: Arc<DaemonState>,
        handler: Arc<dyn PeerEventHandler<DaemonState>>,
    ) -> (Arc<HandlerQueue>, tokio::task::JoinHandle<()>) {
        let (tx, mut rx) = mpsc::channel::<PeerEvent>(QUEUE_CAPACITY);
        let worker_handler = handler.clone();
        let worker_state = state.clone();
        let join = tokio::spawn(async move {
            while let Some(evt) = rx.recv().await {
                let handler = worker_handler.clone();
                handler.handle(&worker_state, &evt).await;
            }
        });
        (Arc::new(HandlerQueue { handler, tx }), join)
    }

    #[derive(Clone)]
    struct HandlerQueue {
        handler: Arc<dyn PeerEventHandler<DaemonState>>,
        tx: tokio::sync::mpsc::Sender<PeerEvent>,
    }

    #[async_trait]
    impl PeerEventHandler<DaemonState> for HandlerQueue {
        fn interests(&self) -> &'static [PeerEventKind] {
            self.handler.interests()
        }

        async fn handle(&self, _ctx: &DaemonState, event: &PeerEvent) {
            // Best-effort enqueue; drop if full to avoid blocking the peer loop.
            let _ = self.tx.try_send(event.clone());
        }
    }

    let mut worker_tasks = Vec::new();
    let mut handlers: Vec<Arc<dyn PeerEventHandler<DaemonState>>> = Vec::new();

    let handlers_to_wrap: Vec<Arc<dyn PeerEventHandler<DaemonState>>> = vec![
        Arc::new(LoggingHandler),
        Arc::new(ListenAddrHandler),
        Arc::new(JoinEventsHandler),
    ];

    for handler in handlers_to_wrap {
        let (queued, worker) = wrap_with_worker(state.clone(), handler);
        worker_tasks.push(worker);
        handlers.push(queued);
    }

    // Run worker tasks in the background.
    tokio::spawn(async move {
        for task in worker_tasks {
            let _ = task.await;
        }
    });

    PeerEventDispatcher::new(handlers)
}
