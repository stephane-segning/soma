use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_proto_build::daemon;

use crate::grpc::DaemonState;

/// Publishes join-related events to daemon subscribers.
pub struct JoinEventsHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for JoinEventsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::JoinRequestSubmitted,
            PeerEventKind::JoinDecision,
            PeerEventKind::JoinFailed,
        ]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::JoinRequestSubmitted { target, request_id } => {
                ctx.publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::JoinSubmitted(
                        daemon::JoinSubmitEvent {
                            request_id: request_id.clone(),
                            target_peer_id: target.to_string(),
                        },
                    )),
                })
                .await;
            }
            PeerEvent::JoinDecision { from, decision } => {
                ctx.publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::JoinDecision(
                        daemon::JoinDecisionEvent {
                            from_peer_id: from.to_string(),
                            decision: Some(decision.clone()),
                        },
                    )),
                })
                .await;
            }
            PeerEvent::JoinFailed { target, error } => {
                ctx.publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::JoinFailed(
                        daemon::JoinFailedEvent {
                            target_peer_id: target.to_string(),
                            error: error.clone(),
                        },
                    )),
                })
                .await;
            }
            _ => {}
        }
    }
}
