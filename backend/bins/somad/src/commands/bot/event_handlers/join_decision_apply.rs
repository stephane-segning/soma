use async_trait::async_trait;
use soma_membership::apply_join_decision;
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};
use tracing::warn;

use crate::commands::bot::http::BotState;

/// Applies accepted join decisions to local storage (requester side).
pub(super) struct JoinDecisionApplyHandler;

#[async_trait]
impl PeerEventHandler<BotState> for JoinDecisionApplyHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::JoinDecision]
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        let PeerEvent::JoinDecision { from, decision } = evt else {
            return;
        };

        // Ignore decisions we generated locally (decider path).
        if *from == ctx.peer_id {
            return;
        }

        // Ignore placeholder "pending manual approval" responses.
        if decision.decision_id.starts_with("reject-pending") {
            return;
        }

        if let Err(err) = apply_join_decision(&ctx.repos, decision).await {
            warn!(%err, "failed to apply join decision");
        }
    }
}
