use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};

use crate::grpc::DaemonState;

/// Tracks listen addresses for status reporting.
pub struct ListenAddrHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for ListenAddrHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::NewListenAddr]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        if let PeerEvent::NewListenAddr { address, .. } = event {
            let mut addrs = ctx.listen_addrs.lock().await;
            let addr = address.to_string();
            if !addrs.contains(&addr) {
                addrs.push(addr);
            }
        }
    }
}
