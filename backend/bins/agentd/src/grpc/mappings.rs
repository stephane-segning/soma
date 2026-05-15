use soma_proto_build::agent;

use crate::tasks::{
    BackgroundTaskKind as StoreBackgroundTaskKind, BackgroundTaskRecord,
    BackgroundTaskStatus as StoreBackgroundTaskStatus,
};

pub(super) fn map_background_task_record(record: BackgroundTaskRecord) -> agent::BackgroundTask {
    agent::BackgroundTask {
        task_id: record.task_id,
        kind: map_store_kind_to_proto(record.kind) as i32,
        status: map_store_status_to_proto(record.status) as i32,
        space_id: record.space_id,
        document_id: record.document_id,
        selection_text: record.selection_text,
        persist_in_document: record.persist_in_document,
        result_text: record.result_text.unwrap_or_default(),
        error: record.error.unwrap_or_default(),
        created_at_ms: record.created_at_ms,
        updated_at_ms: record.updated_at_ms,
    }
}

pub(super) fn proto_kind_to_store(kind: i32) -> Option<StoreBackgroundTaskKind> {
    match agent::BackgroundTaskKind::try_from(kind).ok()? {
        agent::BackgroundTaskKind::ExplainSelection => {
            Some(StoreBackgroundTaskKind::ExplainSelection)
        }
        agent::BackgroundTaskKind::ExpandSelection => {
            Some(StoreBackgroundTaskKind::ExpandSelection)
        }
        agent::BackgroundTaskKind::ResearchSelection => {
            Some(StoreBackgroundTaskKind::ResearchSelection)
        }
        agent::BackgroundTaskKind::Unspecified => None,
    }
}

fn map_store_kind_to_proto(kind: StoreBackgroundTaskKind) -> agent::BackgroundTaskKind {
    match kind {
        StoreBackgroundTaskKind::ExplainSelection => agent::BackgroundTaskKind::ExplainSelection,
        StoreBackgroundTaskKind::ExpandSelection => agent::BackgroundTaskKind::ExpandSelection,
        StoreBackgroundTaskKind::ResearchSelection => agent::BackgroundTaskKind::ResearchSelection,
    }
}

fn map_store_status_to_proto(status: StoreBackgroundTaskStatus) -> agent::BackgroundTaskStatus {
    match status {
        StoreBackgroundTaskStatus::Queued => agent::BackgroundTaskStatus::Queued,
        StoreBackgroundTaskStatus::Running => agent::BackgroundTaskStatus::Running,
        StoreBackgroundTaskStatus::Succeeded => agent::BackgroundTaskStatus::Succeeded,
        StoreBackgroundTaskStatus::Failed => agent::BackgroundTaskStatus::Failed,
    }
}
