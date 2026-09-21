//! Reacts to a blob availability announce by enqueuing a fetch — the
//! "Announce-driven" half of AGENTS.md's "Bots and always-on availability"
//! section: "Mirror bots enqueue a fetch." This was previously a literal
//! no-op comment in `mailbox_outbox.rs`; it gets its own handler because
//! mailbox outbox is about join-delivery retries, a different concern.
//!
//! No candidate-peer resolution needed here: the announcing peer
//! (`from`) obviously has the blob, since it just told us about it. The
//! underlying `FsBlobStore::open_streaming_put` / `put` are idempotent, so
//! a redundant fetch (we already cached this CID) is a wasted round trip
//! at worst, never a correctness issue.

use async_trait::async_trait;
use soma_peer::{
    PeerCommand, PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};

use crate::commands::bot::http::BotState;

pub(super) struct BlobAnnounceFetchHandler;

#[async_trait]
impl PeerEventHandler<BotState> for BlobAnnounceFetchHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::BlobAnnounceReceived]
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        let PeerEvent::BlobAnnounceReceived {
            from,
            space_id,
            cid,
            ..
        } = evt
        else {
            return;
        };

        let _ = ctx
            .peer_commands
            .send(PeerCommand::FetchBlob {
                target: *from,
                addrs: Vec::new(),
                cid: cid.clone(),
                space_id: Some(space_id.clone()),
            })
            .await;
    }
}
