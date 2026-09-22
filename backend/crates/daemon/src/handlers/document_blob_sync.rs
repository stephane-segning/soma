//! Fetches blobs a replicated document references, so images/attachments
//! that arrived via `/soma/doc-sync/1` actually render locally.
//!
//! # Design choice: a broadcast-subscribed background task, not a
//! `PeerEventHandler`
//!
//! Every other reactive handler in this module (`BlobReconcileHandler`,
//! `DocumentSyncHandler`, ...) implements [`soma_peer::events::PeerEventHandler`]
//! and is wired into `crate::dispatch::build_dispatcher`. That dispatcher
//! only ever sees `soma_peer::PeerEvent`s coming off the swarm task.
//!
//! `DocumentReplicated` is not one of those — it's a *daemon* event
//! (`soma_proto_build::daemon::DaemonEvent`), published on
//! `DaemonState.events` (a `broadcast::Sender`) by `soma-replication` once a
//! replicated document wins last-writer-wins (see
//! `crate::handle::types::DaemonEventRecord::DocumentReplicated` and
//! `crate::handle::events`, which does the same proto->plain-type mapping
//! for in-process subscribers). `soma-replication` is out of scope for this
//! change (owned by a different work stream), so the trigger can't be
//! pushed there either.
//!
//! So this follows the other documented precedent for a daemon-owned
//! background task: `crate::runtime::helpers::spawn_mailbox_sweeper`,
//! spawned once in `crate::run` and left to run for the daemon's lifetime.
//! [`spawn_document_blob_sync`] subscribes to `state.events` directly and
//! reacts only to `DocumentReplicated`, ignoring every other event variant.
//!
//! # What counts as a blob reference
//!
//! Document content is Tiptap/ProseMirror JSON. The only two node types the
//! editor writes a content-addressed blob CID onto are `blobImage`
//! (`desktop/desktop-editor/src/extensions/blob-image.tsx`) and `blobFile`
//! (`desktop/desktop-editor/src/extensions/blob-file.tsx`) — both declare a
//! top-level `cid` attribute in `addAttributes()`, populated straight from
//! the upload response's `cid` field
//! (`desktop/desktop-editor/src/extensions/blob-image/hydrate.ts`:
//! `cid: result.cid`). [`extract_blob_cids`] therefore only ever reads
//! `attrs.cid` off a node whose `type` is exactly `"blobImage"` or
//! `"blobFile"`.
//!
//! Deliberately NOT parsed as a CID source: `blobImage`'s `src`/`sources`
//! and `blobFile`'s `href` attributes. Those hold resolved URLs (see
//! `blob-image-view/state.ts`'s `resolveImageSources`, which builds
//! `{ src, alt, width, height }` entries with no `cid` field at all), not
//! bare CIDs — parsing a URL string as if it were a CID would be a guess,
//! and a wrong guess here means fetching garbage over the network.

use std::collections::HashSet;
use std::sync::Arc;

use serde_json::Value;
use soma_proto_build::daemon;
use soma_storage::blobs::BlobRef;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tracing::{debug, warn};

use crate::state::DaemonState;

/// Tiptap node type names that carry a blob CID. See the module doc for
/// the evidence.
const BLOB_NODE_TYPES: [&str; 2] = ["blobImage", "blobFile"];

/// Subscribe to the daemon's broadcast event stream for the lifetime of the
/// daemon and, for every `DocumentReplicated` event, fetch any blobs the
/// replicated document references that aren't already stored locally.
///
/// Runs detached (`tokio::spawn`) — the caller (`crate::run`) doesn't await
/// this, matching `spawn_mailbox_sweeper`'s precedent. Each event's work is
/// itself spawned separately so one slow/stuck blob fetch can never delay
/// processing of the next replicated-document event or back up the
/// broadcast channel.
pub(crate) fn spawn_document_blob_sync(state: Arc<DaemonState>) {
    tokio::spawn(async move {
        let mut stream = BroadcastStream::new(state.events.subscribe());
        while let Some(msg) = stream.next().await {
            let event = match msg {
                Ok(event) => event,
                // Lagged: BroadcastStream surfaces drops as Err. Skip and
                // keep listening — losing a transient event here just means
                // one document's blobs stay unfetched until the next write
                // to it replicates (or a future retry pass), not a crash.
                Err(_lagged) => continue,
            };
            let Some(daemon::daemon_event::Event::DocumentReplicated(replicated)) = event.event
            else {
                continue;
            };

            let state = state.clone();
            tokio::spawn(async move {
                sync_replicated_document_blobs(
                    &state,
                    &replicated.space_id,
                    &replicated.document_id,
                )
                .await;
            });
        }
    });
}

/// Fetch every blob `document_id` references that this device doesn't
/// already have, and record a `blob_refs` row for each one it confirms is
/// present locally (whether it was already here or was just fetched).
///
/// Every failure mode here is logged and swallowed: a missing/unfetchable
/// blob must never surface as a replication failure, since the document
/// itself already replicated successfully by the time this runs.
async fn sync_replicated_document_blobs(state: &DaemonState, space_id: &str, document_id: &str) {
    let document = match state
        .repos
        .document_repo()
        .get_document(space_id, document_id)
        .await
    {
        Ok(Some(document)) => document,
        Ok(None) => {
            // Nothing to do: the document was deleted, or this event is
            // stale relative to a later write. Not an error.
            debug!(%space_id, %document_id, "replicated document vanished before blob sync ran");
            return;
        }
        Err(err) => {
            warn!(%space_id, %document_id, %err, "failed to load replicated document for blob sync");
            return;
        }
    };

    let cids = extract_blob_cids(&document.content_json);
    if cids.is_empty() {
        return;
    }

    for cid in cids {
        let already_local = match state.blob_store.read(space_id, &cid).await {
            Ok(local) => local.is_some(),
            Err(err) => {
                warn!(%space_id, %document_id, %cid, %err, "failed to check local blob store before resolving replicated document's blob reference");
                continue;
            }
        };

        if !already_local
            && let Err(err) = state.blob_resolver.resolve(space_id, &cid).await
        {
            debug!(%space_id, %document_id, %cid, %err, "could not resolve a blob referenced by a replicated document");
            continue;
        }

        let now = crate::handle::now_ms();
        if let Err(err) = state
            .repos
            .blob_repo()
            .add_ref(&BlobRef {
                space_id: space_id.to_string(),
                cid: cid.clone(),
                document_id: document_id.to_string(),
                created_at_ms: now,
            })
            .await
        {
            warn!(%space_id, %document_id, %cid, %err, "failed to record blob_refs for a replicated document's blob reference");
        }
    }
}

/// Walk a document's Tiptap/ProseMirror JSON and collect every `cid` a
/// `blobImage`/`blobFile` node carries, in document order, deduplicated.
///
/// Returns an empty vec for content that doesn't parse as JSON — fails
/// closed, matching `soma_storage::documents`'s `extract_plain_text`
/// convention: a bug here should make blobs quietly unfetched, not send a
/// bogus CID out over the network.
fn extract_blob_cids(content_json: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    collect_blob_cids(&value, &mut out, &mut seen);
    out
}

fn collect_blob_cids(value: &Value, out: &mut Vec<String>, seen: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            let is_blob_node = matches!(
                map.get("type"),
                Some(Value::String(type_name)) if BLOB_NODE_TYPES.contains(&type_name.as_str())
            );
            if is_blob_node
                && let Some(Value::String(cid)) = map.get("attrs").and_then(|attrs| attrs.get("cid"))
            {
                let cid = cid.trim();
                if !cid.is_empty() && seen.insert(cid.to_string()) {
                    out.push(cid.to_string());
                }
            }
            for nested in map.values() {
                collect_blob_cids(nested, out, seen);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_blob_cids(item, out, seen);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::extract_blob_cids;

    #[test]
    fn no_blobs_returns_empty() {
        let content = r#"{
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] }
            ]
        }"#;
        assert_eq!(extract_blob_cids(content), Vec::<String>::new());
    }

    #[test]
    fn several_blobs_are_collected_in_order_and_deduplicated() {
        let content = r#"{
            "type": "doc",
            "content": [
                { "type": "blobImage", "attrs": { "cid": "cid-image-1", "src": "soma-blob://s/cid-image-1" } },
                { "type": "paragraph", "content": [{ "type": "text", "text": "middle" }] },
                { "type": "blobFile", "attrs": { "cid": "cid-file-1", "href": "soma-blob://s/cid-file-1" } },
                {
                    "type": "blockquote",
                    "content": [
                        { "type": "blobImage", "attrs": { "cid": "cid-image-2" } },
                        { "type": "blobImage", "attrs": { "cid": "cid-image-1" } }
                    ]
                }
            ]
        }"#;
        assert_eq!(
            extract_blob_cids(content),
            vec![
                "cid-image-1".to_string(),
                "cid-file-1".to_string(),
                "cid-image-2".to_string(),
            ]
        );
    }

    #[test]
    fn malformed_or_absent_cid_attr_is_skipped_without_panicking() {
        let content = r#"{
            "type": "doc",
            "content": [
                { "type": "blobImage", "attrs": { "cid": null } },
                { "type": "blobImage", "attrs": {} },
                { "type": "blobImage" },
                { "type": "blobFile", "attrs": { "cid": "   " } },
                { "type": "blobFile", "attrs": { "cid": 12345 } },
                { "type": "blobImage", "attrs": { "cid": "the-only-real-one" } }
            ]
        }"#;
        assert_eq!(
            extract_blob_cids(content),
            vec!["the-only-real-one".to_string()]
        );
    }

    #[test]
    fn cid_looking_string_outside_a_blob_node_attrs_cid_is_ignored() {
        let content = r#"{
            "type": "doc",
            "content": [
                { "type": "paragraph", "attrs": { "cid": "deadbeefcafe" }, "content": [] },
                { "type": "paragraph", "content": [{ "type": "text", "text": "cid: deadbeefcafe" }] },
                { "type": "image", "attrs": { "cid": "deadbeefcafe", "src": "https://example.com/x.png" } },
                {
                    "type": "blobImage",
                    "attrs": { "src": "soma-blob://space/deadbeefcafe", "name": "deadbeefcafe.png" }
                }
            ]
        }"#;
        assert_eq!(extract_blob_cids(content), Vec::<String>::new());
    }

    #[test]
    fn non_json_content_returns_empty() {
        assert_eq!(extract_blob_cids("not json"), Vec::<String>::new());
    }
}
