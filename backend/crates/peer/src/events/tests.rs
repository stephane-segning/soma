use super::*;
use crate::PeerEvent;
use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use tokio::time::Duration;

struct RecordingHandler {
    interests: &'static [PeerEventKind],
    hits: Arc<Mutex<Vec<PeerEventKind>>>,
}

#[async_trait]
impl PeerEventHandler<()> for RecordingHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        self.interests
    }

    async fn handle(&self, _ctx: &(), event: &PeerEvent) {
        let kind = PeerEventKind::of(event);
        self.hits.lock().unwrap().push(kind);
    }
}

#[tokio::test]
async fn dispatches_to_interested_handlers_only() {
    let hits_a = Arc::new(Mutex::new(Vec::new()));
    let hits_b = Arc::new(Mutex::new(Vec::new()));

    let handler_a = Arc::new(RecordingHandler {
        interests: &[PeerEventKind::PingOk, PeerEventKind::PingErr],
        hits: hits_a.clone(),
    });
    let handler_b = Arc::new(RecordingHandler {
        interests: &[PeerEventKind::JoinDecision],
        hits: hits_b.clone(),
    });

    let dispatcher = PeerEventDispatcher::new(vec![handler_a, handler_b]);

    let ping_evt = PeerEvent::PingOk {
        rtt: Duration::from_millis(10),
    };
    let join_evt = PeerEvent::JoinDecision {
        from: libp2p::PeerId::random(),
        decision: soma_proto_build::space::JoinDecision::default(),
    };

    dispatcher.dispatch(&(), &ping_evt).await;
    dispatcher.dispatch(&(), &join_evt).await;

    assert_eq!(hits_a.lock().unwrap().as_slice(), &[PeerEventKind::PingOk]);
    assert_eq!(
        hits_b.lock().unwrap().as_slice(),
        &[PeerEventKind::JoinDecision]
    );
}
