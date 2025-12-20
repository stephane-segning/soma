use std::sync::Arc;

use async_trait::async_trait;
use soma_membership::{
    MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST, apply_join_decision,
    decode_outgoing_join_request_payload,
};
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};
use soma_proto_build::spaceroom::JoinDecision;
use soma_storage::mailbox::MailboxRepository;
use tracing::{info, warn};

use crate::http::BotState;
use crate::metrics::{BotMetrics, EventLabels, JoinDecisionLabels, PingLabels};
use libp2p::Multiaddr;
use prost::Message;
use std::time::SystemTime;

/// Handler that records metrics for every peer event.
pub struct MetricsHandler;

/// Handler that emits human-readable traces for notable peer events.
pub struct LoggingHandler;

/// Applies accepted join decisions to local storage (requester side).
pub struct JoinDecisionApplyHandler;
pub struct MailboxOutboxHandler;

/// All event label names in one place to avoid stringly-typed metrics keys.
#[derive(Clone, Copy)]
enum EventKindLabel {
    NewListenAddr,
    ListenerClosed,
    ConnectionEstablished,
    ConnectionError,
    PingOk,
    PingErr,
    IdentifyReceived,
    MdnsDiscovered,
    RendezvousDiscovered,
    RelayReserved,
    RelayCircuitEstablished,
    JoinRequestSubmitted,
    JoinRequestDeliverySubmitted,
    JoinRequestDeliveryAck,
    JoinRequestDeliveryFailed,
    JoinDecision,
    JoinDecisionDeliverySubmitted,
    JoinDecisionDeliveryAck,
    JoinDecisionDeliveryFailed,
    JoinFailed,
    YooptaBlobAdded,
}

impl EventKindLabel {
    fn as_str(self) -> &'static str {
        match self {
            EventKindLabel::NewListenAddr => "new_listen_addr",
            EventKindLabel::ListenerClosed => "listener_closed",
            EventKindLabel::ConnectionEstablished => "connection_established",
            EventKindLabel::ConnectionError => "connection_error",
            EventKindLabel::PingOk => "ping_ok",
            EventKindLabel::PingErr => "ping_err",
            EventKindLabel::IdentifyReceived => "identify_received",
            EventKindLabel::MdnsDiscovered => "mdns_discovered",
            EventKindLabel::RendezvousDiscovered => "rendezvous_discovered",
            EventKindLabel::RelayReserved => "relay_reserved",
            EventKindLabel::RelayCircuitEstablished => "relay_circuit_established",
            EventKindLabel::JoinRequestSubmitted => "join_request_submitted",
            EventKindLabel::JoinRequestDeliverySubmitted => "join_request_delivery_submitted",
            EventKindLabel::JoinRequestDeliveryAck => "join_request_delivery_ack",
            EventKindLabel::JoinRequestDeliveryFailed => "join_request_delivery_failed",
            EventKindLabel::JoinDecision => "join_decision",
            EventKindLabel::JoinDecisionDeliverySubmitted => "join_decision_delivery_submitted",
            EventKindLabel::JoinDecisionDeliveryAck => "join_decision_delivery_ack",
            EventKindLabel::JoinDecisionDeliveryFailed => "join_decision_delivery_failed",
            EventKindLabel::JoinFailed => "join_failed",
            EventKindLabel::YooptaBlobAdded => "yoopta_blob_added",
        }
    }
}

#[derive(Clone, Copy)]
enum JoinDecisionOutcome {
    Approved,
    Rejected,
    Blocked,
    Unspecified,
}

impl JoinDecisionOutcome {
    fn as_str(self) -> &'static str {
        match self {
            JoinDecisionOutcome::Approved => "approved",
            JoinDecisionOutcome::Rejected => "rejected",
            JoinDecisionOutcome::Blocked => "blocked",
            JoinDecisionOutcome::Unspecified => "unspecified",
        }
    }
}

impl From<soma_proto_build::spaceroom::JoinDecisionType> for JoinDecisionOutcome {
    fn from(value: soma_proto_build::spaceroom::JoinDecisionType) -> Self {
        use soma_proto_build::spaceroom::JoinDecisionType::*;

        match value {
            JoinApproved => JoinDecisionOutcome::Approved,
            JoinRejected => JoinDecisionOutcome::Rejected,
            JoinBlocked => JoinDecisionOutcome::Blocked,
            JoinDecisionUnspecified => JoinDecisionOutcome::Unspecified,
        }
    }
}

/// Build the list of peer event handlers that botd uses.
pub fn build_handlers() -> Vec<Arc<dyn PeerEventHandler<BotState>>> {
    vec![
        Arc::new(MetricsHandler),
        Arc::new(LoggingHandler),
        Arc::new(JoinDecisionApplyHandler),
        Arc::new(MailboxOutboxHandler),
    ]
}

#[async_trait]
impl PeerEventHandler<BotState> for MetricsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        PeerEventKind::ALL
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        let metrics = &ctx.metrics;
        match evt {
            PeerEvent::NewListenAddr { .. } => {
                record_event(metrics, EventKindLabel::NewListenAddr);
                metrics.listeners.get_or_create(&()).inc();
            }
            PeerEvent::ListenerClosed { .. } => {
                record_event(metrics, EventKindLabel::ListenerClosed);
            }
            PeerEvent::ConnectionEstablished { .. } => {
                record_event(metrics, EventKindLabel::ConnectionEstablished);
            }
            PeerEvent::ConnectionError { .. } => {
                record_event(metrics, EventKindLabel::ConnectionError);
            }
            PeerEvent::PingOk { .. } => {
                record_event(metrics, EventKindLabel::PingOk);
                record_ping(metrics, "ok");
            }
            PeerEvent::PingErr { .. } => {
                record_event(metrics, EventKindLabel::PingErr);
                record_ping(metrics, "error");
            }
            PeerEvent::IdentifyReceived { .. } => {
                record_event(metrics, EventKindLabel::IdentifyReceived);
            }
            PeerEvent::MdnsDiscovered { .. } => {
                record_event(metrics, EventKindLabel::MdnsDiscovered);
            }
            PeerEvent::RendezvousDiscovered { .. } => {
                record_event(metrics, EventKindLabel::RendezvousDiscovered);
            }
            PeerEvent::RelayReserved { .. } => {
                record_event(metrics, EventKindLabel::RelayReserved);
            }
            PeerEvent::RelayCircuitEstablished { .. } => {
                record_event(metrics, EventKindLabel::RelayCircuitEstablished);
            }
            PeerEvent::JoinRequestSubmitted { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestSubmitted);
            }
            PeerEvent::JoinRequestDeliverySubmitted { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestDeliverySubmitted);
            }
            PeerEvent::JoinRequestDeliveryAck { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestDeliveryAck);
            }
            PeerEvent::JoinRequestDeliveryFailed { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestDeliveryFailed);
            }
            PeerEvent::JoinDecision { decision, .. } => {
                record_event(metrics, EventKindLabel::JoinDecision);
                let outcome =
                    soma_proto_build::spaceroom::JoinDecisionType::try_from(decision.decision)
                        .map(JoinDecisionOutcome::from)
                        .unwrap_or(JoinDecisionOutcome::Unspecified);
                metrics
                    .join_decisions
                    .get_or_create(&JoinDecisionLabels {
                        outcome: outcome.as_str(),
                    })
                    .inc();
            }
            PeerEvent::JoinDecisionDeliverySubmitted { .. } => {
                record_event(metrics, EventKindLabel::JoinDecisionDeliverySubmitted);
            }
            PeerEvent::JoinDecisionDeliveryAck { .. } => {
                record_event(metrics, EventKindLabel::JoinDecisionDeliveryAck);
            }
            PeerEvent::JoinDecisionDeliveryFailed { .. } => {
                record_event(metrics, EventKindLabel::JoinDecisionDeliveryFailed);
            }
            PeerEvent::YooptaBlobAdded { .. } => {
                record_event(metrics, EventKindLabel::YooptaBlobAdded);
            }
            PeerEvent::JoinFailed { .. } => {
                record_event(metrics, EventKindLabel::JoinFailed);
            }
        }
    }
}

#[async_trait]
impl PeerEventHandler<BotState> for LoggingHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::NewListenAddr,
            PeerEventKind::PingOk,
            PeerEventKind::PingErr,
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::ConnectionError,
            PeerEventKind::IdentifyReceived,
            PeerEventKind::MdnsDiscovered,
            PeerEventKind::RendezvousDiscovered,
            PeerEventKind::RelayReserved,
            PeerEventKind::RelayCircuitEstablished,
            PeerEventKind::ListenerClosed,
            PeerEventKind::JoinRequestDeliveryFailed,
            PeerEventKind::JoinDecisionDeliveryFailed,
        ]
    }

    async fn handle(&self, _ctx: &BotState, evt: &PeerEvent) {
        match evt {
            PeerEvent::NewListenAddr { address, peer_id } => {
                info!(%peer_id, listen_addr=%address, "bot listening");
            }
            PeerEvent::PingOk { rtt } => {
                info!(?rtt, "ping success");
            }
            PeerEvent::PingErr { error } => {
                warn!(%error, "ping error");
            }
            PeerEvent::ConnectionEstablished { peer } => {
                info!(%peer, "bot connection established");
            }
            PeerEvent::ConnectionError { peer, error } => {
                warn!(?peer, %error, "bot connection error");
            }
            PeerEvent::IdentifyReceived {
                peer,
                agent,
                protocols,
            } => {
                info!(%peer, %agent, protocols, "bot identify received");
            }
            PeerEvent::MdnsDiscovered { peers } => {
                info!(peers, "bot mdns discovered peers");
            }
            PeerEvent::RendezvousDiscovered { registrations } => {
                info!(registrations, "bot rendezvous discovered");
            }
            PeerEvent::RelayReserved { relay } => {
                info!(%relay, "bot relay reservation accepted");
            }
            PeerEvent::RelayCircuitEstablished { relay } => {
                info!(%relay, "bot relay circuit established");
            }
            PeerEvent::ListenerClosed { reason } => {
                warn!(?reason, "bot listener closed");
            }
            PeerEvent::JoinRequestDeliveryFailed {
                target,
                delivery_id,
                request_id,
                error,
            } => {
                warn!(%target, %delivery_id, %request_id, %error, "join request delivery failed");
            }
            PeerEvent::JoinDecisionDeliveryFailed {
                target,
                delivery_id,
                error,
            } => {
                warn!(%target, %delivery_id, %error, "join decision delivery failed");
            }
            _ => {}
        }
    }
}

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

#[async_trait]
impl PeerEventHandler<BotState> for MailboxOutboxHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::JoinRequestDeliveryAck,
            PeerEventKind::JoinRequestDeliveryFailed,
            PeerEventKind::JoinDecisionDeliveryAck,
            PeerEventKind::JoinDecisionDeliveryFailed,
        ]
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        match evt {
            PeerEvent::ConnectionEstablished { peer } => {
                deliver_due_for_peer(ctx, peer).await;
            }
            PeerEvent::JoinRequestDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox().mark_done(delivery_id).await;
            }
            PeerEvent::JoinRequestDeliveryFailed { delivery_id, .. } => {
                requeue_or_dead(ctx, delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox().mark_done(delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryFailed { delivery_id, .. } => {
                requeue_or_dead(ctx, delivery_id).await;
            }
            PeerEvent::YooptaBlobAdded { .. } => {
                // Mirror bots could enqueue fetch here once blob protocols are wired.
            }
            _ => {}
        }
    }
}

async fn deliver_due_for_peer(ctx: &BotState, peer: &libp2p::PeerId) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let _ = ctx.repos.mailbox().requeue_expired_leases(now_secs).await;

    let subject = peer.to_string();
    let entries = match ctx
        .repos
        .mailbox()
        .list_due_for_subject(i64::MAX, &subject, 50)
        .await
    {
        Ok(entries) => entries,
        Err(err) => {
            warn!(%err, "failed to list mailbox entries for peer");
            return;
        }
    };

    for entry in entries {
        match entry.kind.as_str() {
            MAILBOX_KIND_JOIN_DECISION => {
                let lease_until = now_secs + 30;
                let leased = match ctx
                    .repos
                    .mailbox()
                    .lease(&entry.id, &ctx.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to lease mailbox entry");
                        continue;
                    }
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let decision = match JoinDecision::decode(payload.as_slice()) {
                    Ok(d) => d,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to decode join decision payload");
                        let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let _ = ctx
                    .peer_commands
                    .send(soma_peer::PeerCommand::SendJoinDecision {
                        target: *peer,
                        addrs: Vec::new(),
                        delivery_id: entry.id.clone(),
                        decision,
                    })
                    .await;
            }
            MAILBOX_KIND_JOIN_REQUEST => {
                let lease_until = now_secs + 30;
                let leased = match ctx
                    .repos
                    .mailbox()
                    .lease(&entry.id, &ctx.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to lease mailbox entry");
                        continue;
                    }
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let outgoing = match decode_outgoing_join_request_payload(&payload) {
                    Ok(o) => o,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to decode join request payload");
                        let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let mut addrs = Vec::new();
                for addr in outgoing.addrs {
                    if let Ok(parsed) = addr.parse::<Multiaddr>() {
                        addrs.push(parsed);
                    }
                }

                let _ = ctx
                    .peer_commands
                    .send(soma_peer::PeerCommand::SendJoinRequest {
                        target: *peer,
                        addrs,
                        delivery_id: entry.id.clone(),
                        request_id: outgoing.request_id,
                        request: outgoing.request,
                    })
                    .await;
            }
            _ => {}
        }
    }
}

async fn requeue_or_dead(ctx: &BotState, mailbox_id: &str) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let entry = match ctx.repos.mailbox().get(mailbox_id).await {
        Ok(Some(entry)) => entry,
        Ok(None) => return,
        Err(err) => {
            warn!(%err, %mailbox_id, "failed to load mailbox entry");
            return;
        }
    };

    // Hard TTL: 24h.
    if now_secs.saturating_sub(entry.created_at) > 24 * 60 * 60 {
        let _ = ctx.repos.mailbox().mark_dead(mailbox_id).await;
        return;
    }

    let attempts = entry.attempts.max(1) as u32;
    let exp = attempts.saturating_sub(1).min(8);
    // min 5 min, max 30 min
    let delay = (300_i64.saturating_mul(1_i64 << exp)).clamp(300, 1800);
    let available_at = now_secs + delay;
    let _ = ctx.repos.mailbox().requeue(mailbox_id, available_at).await;
}

fn record_event(metrics: &BotMetrics, label: EventKindLabel) {
    metrics
        .events
        .get_or_create(&EventLabels {
            kind: label.as_str(),
        })
        .inc();
}

fn record_ping(metrics: &BotMetrics, outcome: &'static str) {
    metrics.pings.get_or_create(&PingLabels { outcome }).inc();
}
