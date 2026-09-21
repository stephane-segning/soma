//! `/soma/doc-sync/1` runtime: moves bytes, decides nothing.
//!
//! Every policy question — is this peer allowed to read this space,
//! which version wins, what gets written — belongs to the
//! [`DocumentSyncProvider`] the daemon supplies, for the same reason
//! blob reads go through `BlobProvider`: this crate has no database and
//! no membership table, and giving it one would put authorization in
//! two places.
//!
//! # Why the exchange terminates
//!
//! ```text
//! A -> B  have: A's digests
//! B -> A  have: B's digests, want: what B lacks
//! A -> B  want: what A lacks, documents: what B asked for
//! B -> A  documents: what A asked for      <- no have, no want
//! ```
//!
//! Both directions sync in one exchange. The final response carries
//! neither `have` nor `want`, so the provider has nothing to follow up
//! on and the runtime stops.
//!
//! A misbehaving peer cannot turn this into a loop either: the runtime
//! sends at most one follow-up per response it receives, and it is the
//! provider — not the peer — that decides whether there is one.

use crate::codec::{DocDigest, DocPayload, DocSyncRequest, DocSyncResponse};
use crate::runtime::RuntimeState;
use crate::types::{DocumentDigest, DocumentPayload, DocumentSyncRequest, DocumentSyncResponse};
use libp2p::PeerId;
use libp2p::request_response as reqres;
use tracing::{debug, trace};

pub(super) async fn handle_doc_sync_event(
    state: &mut RuntimeState,
    event: reqres::Event<DocSyncRequest, DocSyncResponse>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => {
                let response = build_response(state, peer, request).await;
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .doc_sync
                    .send_response(channel, response);
            }
            reqres::Message::Response {
                request_id,
                response,
            } => {
                // The space id comes from what *we* recorded when we sent
                // the request, never from the response. A responder that
                // could name the space would be able to steer our writes
                // into a space it is not a member of.
                let Some(space_id) = state.outbound_doc_syncs.remove(&request_id) else {
                    trace!(%peer, "doc-sync response for an unknown request id, ignored");
                    return;
                };
                handle_response(state, peer, space_id, response).await;
            }
        },
        reqres::Event::OutboundFailure {
            peer,
            request_id,
            error,
            ..
        } => {
            state.outbound_doc_syncs.remove(&request_id);
            // Best-effort by design: the next connection or local write
            // starts another exchange, and the digest comparison makes a
            // repeat harmless.
            debug!(%peer, %error, "doc-sync request failed");
        }
        reqres::Event::InboundFailure { peer, error, .. } => {
            debug!(%peer, %error, "doc-sync inbound failure");
        }
        reqres::Event::ResponseSent { .. } => {}
    }
}

/// A refusal carries nothing else — see `DocSyncResponse::authorized`.
fn refused() -> DocSyncResponse {
    DocSyncResponse {
        authorized: false,
        have: Vec::new(),
        documents: Vec::new(),
        want: Vec::new(),
    }
}

async fn build_response(
    state: &mut RuntimeState,
    peer: PeerId,
    request: DocSyncRequest,
) -> DocSyncResponse {
    let Some(provider) = state.document_sync.clone() else {
        // No provider attached: refuse rather than answer emptily, so the
        // caller can tell "not participating" from "nothing to share".
        return refused();
    };
    if request.space_id.is_empty() {
        return refused();
    }

    let response = provider.handle_request(&peer, from_wire_request(request)).await;
    to_wire_response(response)
}

async fn handle_response(
    state: &mut RuntimeState,
    peer: PeerId,
    space_id: String,
    response: DocSyncResponse,
) {
    let Some(provider) = state.document_sync.clone() else {
        return;
    };
    if !response.authorized {
        debug!(%peer, %space_id, "doc-sync refused by peer (not a member, or it has no provider)");
        return;
    }

    let follow_up = provider
        .on_response(&peer, &space_id, from_wire_response(response))
        .await;

    if let Some(next) = follow_up {
        let space_id = next.space_id.clone();
        let wire = to_wire_request(next);
        let req_id = state
            .swarm
            .behaviour_mut()
            .doc_sync
            .send_request(&peer, wire);
        state.outbound_doc_syncs.insert(req_id, space_id);
    }
}

// --- wire <-> public type conversions -----------------------------------
//
// The prost types are `pub(crate)`; the provider trait speaks plain
// structs so the daemon never depends on the wire shape.

pub(super) fn to_wire_request(req: DocumentSyncRequest) -> DocSyncRequest {
    DocSyncRequest {
        space_id: req.space_id,
        have: req.have.into_iter().map(to_wire_digest).collect(),
        want: req.want,
        documents: req.documents.into_iter().map(to_wire_payload).collect(),
    }
}

fn from_wire_request(req: DocSyncRequest) -> DocumentSyncRequest {
    DocumentSyncRequest {
        space_id: req.space_id,
        have: req.have.into_iter().map(from_wire_digest).collect(),
        want: req.want,
        documents: req.documents.into_iter().map(from_wire_payload).collect(),
    }
}

fn from_wire_response(res: DocSyncResponse) -> DocumentSyncResponse {
    DocumentSyncResponse {
        authorized: res.authorized,
        have: res.have.into_iter().map(from_wire_digest).collect(),
        documents: res.documents.into_iter().map(from_wire_payload).collect(),
        want: res.want,
    }
}

fn to_wire_response(res: DocumentSyncResponse) -> DocSyncResponse {
    DocSyncResponse {
        authorized: res.authorized,
        have: res.have.into_iter().map(to_wire_digest).collect(),
        documents: res.documents.into_iter().map(to_wire_payload).collect(),
        want: res.want,
    }
}

fn from_wire_digest(d: DocDigest) -> DocumentDigest {
    DocumentDigest {
        document_id: d.document_id,
        updated_at_ms: d.updated_at_ms,
        origin_peer_id: d.origin_peer_id,
        published: d.published,
    }
}

fn to_wire_digest(d: DocumentDigest) -> DocDigest {
    DocDigest {
        document_id: d.document_id,
        updated_at_ms: d.updated_at_ms,
        origin_peer_id: d.origin_peer_id,
        published: d.published,
    }
}

fn from_wire_payload(p: DocPayload) -> DocumentPayload {
    DocumentPayload {
        document_id: p.document_id,
        content_json: p.content_json,
        updated_at_ms: p.updated_at_ms,
        origin_peer_id: p.origin_peer_id,
        published: p.published,
        title: p.title,
        parent_page_ids: p.parent_page_ids,
    }
}

fn to_wire_payload(p: DocumentPayload) -> DocPayload {
    DocPayload {
        document_id: p.document_id,
        content_json: p.content_json,
        updated_at_ms: p.updated_at_ms,
        origin_peer_id: p.origin_peer_id,
        published: p.published,
        title: p.title,
        parent_page_ids: p.parent_page_ids,
    }
}
