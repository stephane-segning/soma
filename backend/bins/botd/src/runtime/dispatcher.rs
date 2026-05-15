use std::{sync::Arc, time::Duration};

use soma_peer::events::{PeerEventDispatcher, PeerEventHandler, handler_with_queue};
use tokio::task::JoinHandle;

use crate::{event_handlers, http::BotState};

pub(super) fn spawn_mailbox_sweeper(state: Arc<BotState>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5 * 60)).await;
            sweep_mailbox(state.as_ref()).await;
        }
    });
}

pub(super) fn build_dispatcher(state: Arc<BotState>) -> PeerEventDispatcher<BotState> {
    const QUEUE_CAPACITY: usize = 64;

    let handlers = event_handlers::build_handlers();
    let (queued_handlers, tasks) = wrap_with_queues(state.clone(), handlers, QUEUE_CAPACITY);

    tokio::spawn(async move {
        for task in tasks {
            let _ = task.await;
        }
    });

    PeerEventDispatcher::new(queued_handlers)
}

async fn sweep_mailbox(state: &BotState) {
    soma_membership::outbox::sweep_due(&state.repos, &state.peer_id, &state.peer_commands).await;
}

fn wrap_with_queues<Ctx>(
    ctx: Arc<Ctx>,
    handlers: Vec<Arc<dyn PeerEventHandler<Ctx>>>,
    capacity: usize,
) -> (Vec<Arc<dyn PeerEventHandler<Ctx>>>, Vec<JoinHandle<()>>)
where
    Ctx: Send + Sync + 'static,
{
    let mut wrapped = Vec::with_capacity(handlers.len());
    let mut tasks = Vec::with_capacity(handlers.len());

    for handler in handlers {
        let (queued, task) = handler_with_queue(ctx.clone(), handler, capacity);
        wrapped.push(queued);
        tasks.push(task);
    }

    (wrapped, tasks)
}
