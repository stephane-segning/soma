//! Document replication policy for `/soma/doc-sync/1`.
//!
//! The peer crate moves bytes and decides nothing; everything that needs
//! the database or the membership table lives here. That split is the
//! same one `BlobProvider` and `JoinDecider` already use, and it is what
//! keeps authorization in exactly one place.
//!
//! # The merge rule, and why it is not a CRDT
//!
//! A document is a whole ProseMirror JSON blob that the editor rewrites
//! on every save. There is no operation log, no state vector, and the
//! editor (Tiptap) emits neither — so there is nothing for a CRDT to
//! merge. `soma-agentd` does contain a real `yrs` merge
//! (`agentd/src/handle/drift.rs`), but it consumes Yjs update binaries
//! that nothing in this system produces, and no Yjs⇄ProseMirror bridge
//! exists in either direction. Wiring it up would mean adopting a
//! Yjs-native editor binding, which is a different project.
//!
//! So this is last-writer-wins on `(updated_at_ms, origin_peer_id)`,
//! compared lexicographically. The second element is what makes it
//! *deterministic*: with a bare timestamp, two peers that write in the
//! same millisecond each keep their own copy and never converge,
//! because neither version is "newer" from either side. Adding a stable
//! tiebreaker means both sides independently pick the same winner.
//!
//! Be clear about the cost: concurrent edits to the same document lose
//! one side's work, exactly as they already do locally today. This makes
//! replication *converge*; it does not make it *merge*.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use libp2p::PeerId;
use soma_peer::{
    DocumentDigest, DocumentPayload, DocumentSyncProvider, DocumentSyncRequest,
    DocumentSyncResponse,
};
use soma_proto_build::daemon;
use soma_storage::RepositoryProvider;
use soma_storage::documents::Document;
use soma_storage::pages::Page;
use tokio::sync::broadcast;
use tracing::{debug, warn};

/// Most documents sent in one response. A space with more than this
/// syncs across several exchanges, each triggered by the next connect
/// or write — slower to converge, but it keeps one message inside
/// `MAX_DOC_SYNC_MESSAGE_BYTES` instead of failing the whole sync.
const MAX_DOCUMENTS_PER_MESSAGE: usize = 32;

#[cfg(test)]
mod tests;

/// Ids we have asked a given peer for, per space.
///
/// This has to be real state. The obvious shortcut — when documents
/// arrive, re-derive "would I have wanted these?" from the payloads
/// themselves — self-approves: a document for an id we do not hold
/// always looks wanted, so any authorized peer could write anything
/// into any space it shares with us without ever being asked. A test
/// (`drops_documents_that_were_never_requested`) pins that down.
type OutstandingWants = Mutex<HashMap<(PeerId, String), HashSet<String>>>;

pub struct StorageDocumentSync {
    repos: Arc<dyn RepositoryProvider>,
    events: broadcast::Sender<daemon::DaemonEvent>,
    outstanding: OutstandingWants,
}

impl StorageDocumentSync {
    pub fn new(
        repos: Arc<dyn RepositoryProvider>,
        events: broadcast::Sender<daemon::DaemonEvent>,
    ) -> Self {
        Self {
            repos,
            events,
            outstanding: Mutex::new(HashMap::new()),
        }
    }

    /// Record what we are about to ask `peer` for, replacing anything
    /// outstanding for that peer and space — a fresh ask supersedes the
    /// last one, so the map cannot grow without bound as exchanges
    /// repeat on every reconnect.
    fn record_wants(&self, peer: &PeerId, space_id: &str, ids: &[String]) {
        let key = (*peer, space_id.to_string());
        let mut guard = self.outstanding.lock().expect("outstanding wants poisoned");
        if ids.is_empty() {
            guard.remove(&key);
        } else {
            guard.insert(key, ids.iter().cloned().collect());
        }
    }

    /// Take the ids we are still owed by `peer` for `space_id`. Taking
    /// rather than reading means a replayed message cannot be used to
    /// write the same document twice on one ask.
    fn take_wants(&self, peer: &PeerId, space_id: &str) -> HashSet<String> {
        let key = (*peer, space_id.to_string());
        self.outstanding
            .lock()
            .expect("outstanding wants poisoned")
            .remove(&key)
            .unwrap_or_default()
    }

    /// Membership is the authorization boundary, and it is checked
    /// against the libp2p-authenticated peer id — not against anything
    /// the request claims about itself.
    ///
    /// The owner counts even without a local membership row, and that
    /// is not a loosening — it is required for sync to work at all.
    /// Membership rows are one-sided today: a peer that joins via an
    /// invite records only *itself*, so a joiner's roster never
    /// contains the owner who approved it. Checking rows alone means
    /// the joiner refuses the owner and nothing ever replicates, which
    /// is exactly what the first two-daemon run showed. `owner_peer_id`
    /// is the trust anchor pinned at join time, so trusting it here
    /// leans on the same value the membership machinery already does.
    ///
    /// The consequence to be honest about: two non-owner members cannot
    /// authorize each other, so today every document flows through the
    /// owner (or a bot mirror). Fixing that means replicating the
    /// roster with each row's owner-signed capability so a peer can
    /// verify a third party's membership instead of being told about
    /// it — a membership-layer change, not a sync one.
    async fn is_member(&self, peer: &PeerId, space_id: &str) -> bool {
        let repo = self.repos.membership_repo();
        let peer_id = peer.to_string();

        if repo
            .get_membership(space_id, &peer_id)
            .await
            .map(|m| m.is_some())
            .unwrap_or(false)
        {
            return true;
        }

        repo.get_space(space_id)
            .await
            .ok()
            .flatten()
            .and_then(|s| s.owner_peer_id)
            .is_some_and(|owner| owner == peer_id)
    }

    async fn local_digests(&self, space_id: &str) -> Vec<DocumentDigest> {
        match self
            .repos
            .document_repo()
            .list_document_digests(space_id)
            .await
        {
            Ok(rows) => rows
                .into_iter()
                .map(|d| DocumentDigest {
                    document_id: d.document_id,
                    updated_at_ms: d.updated_at_ms,
                    origin_peer_id: d.origin_peer_id,
                    published: d.published,
                })
                .collect(),
            Err(err) => {
                warn!(%space_id, %err, "doc-sync: failed to list local digests");
                Vec::new()
            }
        }
    }

    /// Which of `remote`'s digests beat what we hold locally.
    async fn wanted_from(&self, space_id: &str, remote: &[DocumentDigest]) -> Vec<String> {
        let local = self.local_digests(space_id).await;
        remote
            .iter()
            .filter(|r| {
                match local.iter().find(|l| l.document_id == r.document_id) {
                    Some(mine) => version_of(r) > version_of(mine),
                    // Not held at all — always want it.
                    None => true,
                }
            })
            .take(MAX_DOCUMENTS_PER_MESSAGE)
            .map(|r| r.document_id.clone())
            .collect()
    }

    /// Read out the documents a peer asked for, attaching each one's
    /// page row so the receiver can actually navigate to it.
    async fn payloads_for(&self, space_id: &str, ids: &[String]) -> Vec<DocumentPayload> {
        let mut out = Vec::new();
        for id in ids.iter().take(MAX_DOCUMENTS_PER_MESSAGE) {
            let doc = match self.repos.document_repo().get_document(space_id, id).await {
                Ok(Some(doc)) => doc,
                Ok(None) => continue,
                Err(err) => {
                    warn!(%space_id, document_id = %id, %err, "doc-sync: read failed");
                    continue;
                }
            };
            let page = self
                .repos
                .page_repo()
                .get_page(space_id, id)
                .await
                .ok()
                .flatten();
            out.push(DocumentPayload {
                document_id: doc.document_id,
                content_json: doc.content_json,
                updated_at_ms: doc.updated_at_ms,
                origin_peer_id: doc.origin_peer_id,
                published: doc.published,
                title: page.as_ref().map(|p| p.title.clone()).unwrap_or_default(),
                parent_page_ids: page.map(|p| p.parent_page_ids).unwrap_or_default(),
            });
        }
        out
    }

    /// Write incoming documents, keeping only those that win. Returns
    /// the ids actually written so callers can report real changes
    /// rather than attempts.
    async fn apply(
        &self,
        from: &PeerId,
        space_id: &str,
        requested: &HashSet<String>,
        documents: Vec<DocumentPayload>,
    ) -> Vec<String> {
        let mut applied = Vec::new();
        for payload in documents {
            // Only accept what we asked for. Without this an authorized
            // peer could answer a two-document pull with a hundred
            // documents and write them all into our space.
            if !requested.contains(&payload.document_id) {
                debug!(
                    %space_id,
                    document_id = %payload.document_id,
                    "doc-sync: dropping unsolicited document"
                );
                continue;
            }
            if payload.document_id.is_empty() || payload.content_json.is_empty() {
                continue;
            }

            let document = Document {
                space_id: space_id.to_string(),
                document_id: payload.document_id.clone(),
                content_json: payload.content_json,
                published: payload.published,
                updated_at_ms: payload.updated_at_ms,
                origin_peer_id: payload.origin_peer_id,
            };
            match self
                .repos
                .document_repo()
                .upsert_document_if_newer(&document)
                .await
            {
                // Lost last-writer-wins: storage untouched, so the page
                // is left alone too — a stale version must not rename a
                // page to its own older title.
                Ok(false) => continue,
                Err(err) => {
                    warn!(%space_id, document_id = %payload.document_id, %err, "doc-sync: write failed");
                    continue;
                }
                Ok(true) => {}
            }

            if !payload.title.is_empty() {
                let page = Page {
                    space_id: space_id.to_string(),
                    page_id: payload.document_id.clone(),
                    title: payload.title,
                    parent_page_ids: payload.parent_page_ids,
                    created_at_ms: payload.updated_at_ms,
                    updated_at_ms: payload.updated_at_ms,
                };
                // `create_page` is insert-or-nothing, so an existing page
                // needs the explicit title/parent updates underneath.
                if let Err(err) = self.repos.page_repo().create_page(&page).await {
                    warn!(%space_id, page_id = %page.page_id, %err, "doc-sync: page create failed");
                }
                let _ = self
                    .repos
                    .page_repo()
                    .update_title(space_id, &page.page_id, &page.title)
                    .await;
                let _ = self
                    .repos
                    .page_repo()
                    .set_parents(space_id, &page.page_id, &page.parent_page_ids)
                    .await;
            }

            // Fire per document: the renderer keys its cache by document
            // id, and one aggregate event would make it refetch a space
            // it may not even have open.
            let _ = self.events.send(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::DocumentReplicated(
                    daemon::DocumentReplicatedEvent {
                        space_id: space_id.to_string(),
                        document_id: payload.document_id.clone(),
                        from_peer_id: from.to_string(),
                    },
                )),
            });
            applied.push(payload.document_id);
        }
        applied
    }
}

/// The comparable version of a digest. Borrowed rather than cloned
/// because this runs once per document per comparison.
fn version_of(d: &DocumentDigest) -> (i64, &str) {
    (d.updated_at_ms, d.origin_peer_id.as_str())
}

fn refused() -> DocumentSyncResponse {
    DocumentSyncResponse {
        authorized: false,
        have: Vec::new(),
        documents: Vec::new(),
        want: Vec::new(),
    }
}

#[async_trait]
impl DocumentSyncProvider for StorageDocumentSync {
    async fn handle_request(
        &self,
        from: &PeerId,
        request: DocumentSyncRequest,
    ) -> DocumentSyncResponse {
        if !self.is_member(from, &request.space_id).await {
            debug!(peer = %from, space_id = %request.space_id, "doc-sync: refused, not a member");
            return refused();
        }

        // A request may carry documents, but only ones we asked for in
        // our own previous response. We do not keep that ask as state:
        // re-deriving "what do I still want from these" is equivalent,
        // and it means a restarted peer cannot be fed documents by
        // replaying an old exchange.
        if !request.documents.is_empty() {
            let permitted = self.take_wants(from, &request.space_id);
            let applied = self
                .apply(from, &request.space_id, &permitted, request.documents)
                .await;
            if !applied.is_empty() {
                debug!(
                    peer = %from,
                    space_id = %request.space_id,
                    count = applied.len(),
                    "doc-sync: applied documents from request"
                );
            }
        }

        // Answering a pull: send what was asked for, and nothing else.
        if !request.want.is_empty() {
            return DocumentSyncResponse {
                authorized: true,
                have: Vec::new(),
                documents: self.payloads_for(&request.space_id, &request.want).await,
                want: Vec::new(),
            };
        }

        // Answering an offer: advertise ours and say what we want back.
        let want = self.wanted_from(&request.space_id, &request.have).await;
        self.record_wants(from, &request.space_id, &want);
        DocumentSyncResponse {
            authorized: true,
            have: self.local_digests(&request.space_id).await,
            documents: Vec::new(),
            want,
        }
    }

    async fn on_response(
        &self,
        from: &PeerId,
        space_id: &str,
        response: DocumentSyncResponse,
    ) -> Option<DocumentSyncRequest> {
        if !response.documents.is_empty() {
            let permitted = self.take_wants(from, space_id);
            let applied = self
                .apply(from, space_id, &permitted, response.documents)
                .await;
            if !applied.is_empty() {
                debug!(
                    peer = %from,
                    %space_id,
                    count = applied.len(),
                    "doc-sync: applied documents from response"
                );
            }
        }

        let want = self.wanted_from(space_id, &response.have).await;
        self.record_wants(from, space_id, &want);
        let documents = if response.want.is_empty() {
            Vec::new()
        } else {
            self.payloads_for(space_id, &response.want).await
        };

        // Nothing to ask for and nothing they asked of us: the exchange
        // is finished. Returning `None` here is what ends it.
        if want.is_empty() && documents.is_empty() {
            return None;
        }

        Some(DocumentSyncRequest {
            space_id: space_id.to_string(),
            have: Vec::new(),
            want,
            documents,
        })
    }
}
