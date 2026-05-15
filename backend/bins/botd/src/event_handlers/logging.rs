use async_trait::async_trait;
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};
use tracing::{info, warn};

use crate::http::BotState;

/// Handler that emits human-readable traces for notable peer events.
pub(super) struct LoggingHandler;

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
                ..
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
