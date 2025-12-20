use std::sync::Arc;

use soma_peer::events::{PeerEventDispatcher, PeerEventHandler};

use crate::DaemonState;
use crate::handlers::{
    JoinDecisionPersistenceHandler, JoinEventsHandler, ListenAddrHandler, LoggingHandler,
    MailboxOutboxHandler,
};

/// Build the dispatcher and spin up per-handler workers for backpressure isolation.
pub async fn build_dispatcher(state: Arc<DaemonState>) -> PeerEventDispatcher<DaemonState> {
    const QUEUE_CAPACITY: usize = 64;

    let handlers_to_wrap: Vec<Arc<dyn PeerEventHandler<DaemonState>>> = vec![
        Arc::new(LoggingHandler),
        Arc::new(ListenAddrHandler),
        Arc::new(JoinEventsHandler),
        Arc::new(JoinDecisionPersistenceHandler),
        Arc::new(MailboxOutboxHandler),
    ];

    let mut worker_tasks = Vec::new();
    let mut handlers: Vec<Arc<dyn PeerEventHandler<DaemonState>>> = Vec::new();

    for handler in handlers_to_wrap {
        let (queued, worker) =
            soma_peer::events::handler_with_queue(state.clone(), handler, QUEUE_CAPACITY);
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
