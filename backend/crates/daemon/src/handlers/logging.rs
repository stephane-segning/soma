use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use tracing::{info, warn};

use crate::state::DaemonState;

/// Logs connectivity-related events.
pub struct LoggingHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for LoggingHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::NewListenAddr,
            PeerEventKind::ListenerClosed,
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::ConnectionError,
            PeerEventKind::PingOk,
            PeerEventKind::PingErr,
            PeerEventKind::IdentifyReceived,
            PeerEventKind::MdnsDiscovered,
            PeerEventKind::RendezvousDiscovered,
            PeerEventKind::RelayReserved,
            PeerEventKind::RelayCircuitEstablished,
        ]
    }

    async fn handle(&self, _ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::NewListenAddr { address, peer_id } => {
                info!(%peer_id, listen_addr=%address, "daemon listening");
            }
            PeerEvent::ListenerClosed { reason } => {
                info!(?reason, "daemon listener closed");
            }
            PeerEvent::ConnectionEstablished { peer } => {
                info!(%peer, "daemon connected");
            }
            PeerEvent::ConnectionError { peer, error } => {
                warn!(?peer, %error, "daemon connection error");
            }
            PeerEvent::PingOk { rtt } => {
                info!(?rtt, "daemon ping ok");
            }
            PeerEvent::PingErr { error } => {
                warn!(%error, "daemon ping error");
            }
            PeerEvent::IdentifyReceived {
                peer,
                agent,
                protocols,
                ..
            } => {
                info!(%peer, %agent, protocols, "daemon identify received");
            }
            PeerEvent::MdnsDiscovered { peers } => {
                info!(peers, "daemon mdns discovered peers");
            }
            PeerEvent::RendezvousDiscovered { registrations } => {
                info!(registrations, "daemon rendezvous discovered");
            }
            PeerEvent::RelayReserved { relay } => {
                info!(%relay, "daemon relay reservation accepted");
            }
            PeerEvent::RelayCircuitEstablished { relay } => {
                info!(%relay, "daemon relay circuit established");
            }
            _ => {}
        }
    }
}
