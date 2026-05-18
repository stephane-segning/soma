use std::time::SystemTime;

use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};

use crate::state::DaemonState;

pub struct IdentifyStoreHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for IdentifyStoreHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::IdentifyReceived]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        let PeerEvent::IdentifyReceived {
            peer, public_key, ..
        } = event
        else {
            return;
        };

        if let Some(pk) = public_key {
            let mut map = ctx.identify_keys.lock().await;
            map.insert(*peer, pk.clone());
            let _ = ctx
                .repos
                .peer_keys_repo()
                .upsert(&peer.to_string(), &pk.encode_protobuf(), now_secs())
                .await;
        }
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
