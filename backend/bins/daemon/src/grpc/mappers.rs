use std::time::{SystemTime, UNIX_EPOCH};

use soma_proto_build::daemon;
use soma_storage::{blobs::BlobMetadata, pages::Page};

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

pub(super) fn to_page_record(page: Page) -> daemon::PageRecord {
    daemon::PageRecord {
        space_id: page.space_id,
        page_id: page.page_id,
        title: page.title,
        parent_page_ids: page.parent_page_ids,
        created_at_ms: page.created_at_ms,
        updated_at_ms: page.updated_at_ms,
    }
}

pub(super) fn to_blob_metadata(blob: BlobMetadata) -> daemon::BlobMetadata {
    daemon::BlobMetadata {
        space_id: blob.space_id,
        cid: blob.cid,
        size: blob.size.max(0) as u64,
        mime: blob.mime,
        name: blob.name,
        created_at_ms: blob.created_at_ms,
        last_seen_ms: blob.last_seen_ms,
    }
}

pub(super) fn map_space_record(space: crate::services::space::SpaceRecord) -> daemon::Space {
    daemon::Space {
        space_id: space.space_id,
        display_name: space.display_name.unwrap_or_default(),
        owner_peer_id: space.owner_peer_id.unwrap_or_default(),
        created_at: space.created_at,
    }
}
