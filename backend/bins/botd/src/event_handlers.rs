use std::sync::Arc;

use soma_peer::events::PeerEventHandler;

use crate::http::BotState;

mod join_decision_apply;
mod logging;
mod mailbox_outbox;
mod metrics;
mod metrics_labels;

use join_decision_apply::JoinDecisionApplyHandler;
use logging::LoggingHandler;
use mailbox_outbox::MailboxOutboxHandler;
use metrics::MetricsHandler;

/// Build the list of peer event handlers that botd uses.
pub fn build_handlers() -> Vec<Arc<dyn PeerEventHandler<BotState>>> {
    vec![
        Arc::new(MetricsHandler),
        Arc::new(LoggingHandler),
        Arc::new(JoinDecisionApplyHandler),
        Arc::new(MailboxOutboxHandler),
    ]
}
