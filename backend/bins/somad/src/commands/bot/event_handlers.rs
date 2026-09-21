use std::sync::Arc;

use soma_peer::events::PeerEventHandler;

use crate::commands::bot::http::BotState;

mod blob_announce_fetch;
mod identify_store;
mod issuer_inbound;
mod join_decision_apply;
mod logging;
mod mailbox_outbox;
mod metrics;
mod metrics_labels;
#[cfg(test)]
mod test_support;

use blob_announce_fetch::BlobAnnounceFetchHandler;
use identify_store::IdentifyStorePersistHandler;
use issuer_inbound::IssuerInboundHandler;
use join_decision_apply::JoinDecisionApplyHandler;
use logging::LoggingHandler;
use mailbox_outbox::MailboxOutboxHandler;
use metrics::MetricsHandler;

/// Build the list of peer event handlers that botd uses.
pub fn build_handlers() -> Vec<Arc<dyn PeerEventHandler<BotState>>> {
    vec![
        Arc::new(MetricsHandler),
        Arc::new(LoggingHandler),
        // Must run for every `IdentifyReceived` so `IssuerInboundHandler`'s
        // key resolver (and `JoinDecisionApplyHandler`'s) can bootstrap
        // trust for a peer this bot has never verified anything from yet.
        // Ordering relative to the other handlers doesn't matter here —
        // `IdentifyReceived` and `IssuerOfferReceived`/`JoinDecision` are
        // always separate events (Identify happens at connection time,
        // well before any application-level message) — but it's listed
        // early for readability.
        Arc::new(IdentifyStorePersistHandler),
        Arc::new(JoinDecisionApplyHandler),
        Arc::new(IssuerInboundHandler),
        Arc::new(MailboxOutboxHandler),
        Arc::new(BlobAnnounceFetchHandler),
    ]
}
